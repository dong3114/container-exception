import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { ContactSelectionRepository, selectionView } from '../registry/contact-selection.repository.js';
import type { ContactSelectionDto } from '../registry/dto.js';
import { RegistryService } from '../registry/registry.service.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { AgentRunRepository } from './agent-run.repository.js';
import { RecoveryContextService } from './context.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_GAP = ['MISSING', 'NEEDS_REFRESH'];

/**
 * T-129 기다리는 Agent 실행의 받는 주소를 사람이 고른다. 적격 주소가 둘 이상이라 실행이 `CONTACT_SELECTION_REQUIRED` 로 멈춘 경우에만 받는다.
 * 선택 범위 = 이 실행 · 이 공백 주체(시설 · 트럭 풀) 하나 — 전역 기본값이 아니다. 아무 주소 id 나 받지 않는다(`assertSelectable`).
 * DB 에 남긴 뒤 알림을 보낸다 — 재조정이 DB 의 선택을 보고 실행을 깨운다(알림을 놓쳐도 같은 결과). 깨어난 그래프가 그 주소로 초안을 만든다.
 */
@Injectable()
export class AgentContactSelectionService {
  constructor(
    @Inject(AgentRunRepository) private readonly runs: AgentRunRepository,
    @Inject(RecoveryContextService) private readonly context: RecoveryContextService,
    @Inject(RegistryService) private readonly registry: RegistryService,
    @Inject(ContactSelectionRepository) private readonly selections: ContactSelectionRepository,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {}

  async select(agentRunId: string, actorHeader: string | undefined, body: unknown): Promise<ContactSelectionDto> {
    if (!UUID.test(agentRunId)) throw new ValidationError('INVALID_ID', 'agentRunId must be a UUID', ['agentRunId']);
    const parsed = z.object({ address_id: z.string().uuid(), note: z.string().trim().min(1).max(200).optional() }).strict().safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_SELECTION_REQUEST', 'address_id (uuid) is required; note is optional (max 200)', parsed.error.issues.map((i) => i.path.join('.')));
    const actorId = await this.registry.human(actorHeader);
    const run = await this.runs.findRun(agentRunId);
    if (!run) throw new BusinessRuleError('NOT_FOUND', 'No agent run with this id', 404);
    const subjectType = run.pendingRefType;
    const subjectId = run.pendingRefId;
    if (run.status !== 'WAITING_HUMAN' || run.waitingReason !== 'CONTACT_SELECTION_REQUIRED' || (subjectType !== 'FACILITY' && subjectType !== 'TRUCK_POOL') || !subjectId) {
      throw new BusinessRuleError('NOT_WAITING_FOR_CONTACT_SELECTION', `This run is not waiting for a contact choice (status ${run.status}, waiting ${run.waitingReason ?? 'none'})`, 409);
    }
    const gaps = await this.context.informationGaps(run.recoveryRunId);
    const gap = gaps.gaps.find((g) => g.subject_id === subjectId && OPEN_GAP.includes(g.state));
    if (!gap) throw new BusinessRuleError('GAP_ALREADY_RESOLVED', 'The information this run was going to ask for is no longer missing', 409);
    if (!gap.owner_counterparty_id) throw new BusinessRuleError('NO_OWNER_REGISTERED', 'Nobody is registered as the owner / operator of this subject — register one first', 409);
    const simulated = (await this.context.run(run.recoveryRunId)).containsSimulated;
    await this.registry.assertSelectable(parsed.data.address_id, { counterpartyId: gap.owner_counterparty_id, role: gap.suggested_counterparty_role, simulated });

    const selectionId = this.ids.newId();
    await this.tx.run(async (t) => {
      await this.selections.insert(t, {
        selectionId,
        scopeType: 'AGENT_RUN',
        agentRunId,
        subjectType,
        subjectId,
        addressId: parsed.data.address_id,
        selectedByActorId: actorId,
        selectedAt: this.clock.now().toDb(),
        note: parsed.data.note ?? null,
      });
      await this.audit.record(t, {
        actorId,
        action: AUDIT_ACTION.CONTACT_SELECTED,
        targetType: 'CONTACT_SELECTION',
        targetId: selectionId,
        afterRef: `agent_run=${agentRunId};address=${parsed.data.address_id}`,
        result: 'SUCCESS',
        isSimulated: simulated,
      });
    });
    // 재조정을 바로 깨운다(정확성은 DB 재조정 — 이 알림이 없어도 다음 주기에 깨어난다)
    this.signals.emit({ type: 'REGISTRY_CHANGED', counterpartyId: gap.owner_counterparty_id });
    return selectionView((await this.selections.find(selectionId))!);
  }
}
