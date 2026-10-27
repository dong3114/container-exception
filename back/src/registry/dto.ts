import { ApiProperty } from '@nestjs/swagger';
import { CHANNEL_TYPE, COMMUNICATION_STATUS, COUNTERPARTY_ROLE, EMAIL_VERIFICATION_STATUS, FACILITY_TYPE, RELATIONSHIP_STATUS } from '../db/schema/codes.js';
import { GATE_CONDITIONS, GATE_REASONS } from './contact-gate.js';

/**
 * 등록부 · 발송 자격 응답 모양(OpenAPI 정본 — ADR-028). JSON 은 snake_case, 시각은 +09:00.
 * 클래스는 문서 생성용 선언이다. 값은 서비스가 만든 평범한 객체를 그대로 돌려준다.
 */

export class GateConditionDto {
  @ApiProperty({ enum: GATE_CONDITIONS, description: 'FR-ELG-01 condition' })
  condition!: (typeof GATE_CONDITIONS)[number];

  @ApiProperty({ type: Boolean })
  passed!: boolean
}

export class GateReasonDto {
  @ApiProperty({ enum: GATE_REASONS, description: 'Why the address is blocked (a result value, not an HTTP error code)' })
  code!: (typeof GATE_REASONS)[number];

  @ApiProperty({ enum: ['PRODUCT_RULE', 'DEV_SAFETY'], description: 'PRODUCT_RULE = Contact Gate, DEV_SAFETY = test recipient allowlist' })
  layer!: 'PRODUCT_RULE' | 'DEV_SAFETY';
}

export class AddressStatusDto {
  @ApiProperty({ type: String, format: 'uuid' })
  address_id!: string

  @ApiProperty({ enum: CHANNEL_TYPE })
  channel_type!: (typeof CHANNEL_TYPE)[number];

  @ApiProperty({ type: String, description: 'Normalized address. Seed addresses are synthetic *.invalid values' })
  normalized_address!: string

  @ApiProperty({ enum: EMAIL_VERIFICATION_STATUS })
  email_verification_status!: (typeof EMAIL_VERIFICATION_STATUS)[number];

  @ApiProperty({ enum: RELATIONSHIP_STATUS })
  relationship_status!: (typeof RELATIONSHIP_STATUS)[number];

  @ApiProperty({ enum: COMMUNICATION_STATUS })
  communication_status!: (typeof COMMUNICATION_STATUS)[number];

  @ApiProperty({ type: Boolean, description: 'MOCK channel — nothing leaves the system' })
  is_simulated!: boolean
}

export class AddressSummaryDto extends AddressStatusDto {
  @ApiProperty({ type: Boolean, description: 'Contact Gate + dev safety verdict at evaluated_at' })
  eligible!: boolean

  @ApiProperty({ type: [GateReasonDto] })
  reasons!: GateReasonDto[];
}

export class ContactSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  contact_id!: string

  @ApiProperty({ type: String })
  person_name!: string

  @ApiProperty({ type: String, nullable: true })
  team!: string | null;

  @ApiProperty({ type: Boolean })
  is_active!: boolean

  @ApiProperty({ type: [AddressSummaryDto] })
  addresses!: AddressSummaryDto[];
}

export class CounterpartySummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  counterparty_id!: string

  @ApiProperty({ type: String })
  display_name!: string

  @ApiProperty({ enum: COUNTERPARTY_ROLE })
  source_role!: (typeof COUNTERPARTY_ROLE)[number];

  @ApiProperty({ type: Boolean })
  is_active!: boolean

  @ApiProperty({ type: [ContactSummaryDto] })
  contacts!: ContactSummaryDto[];
}

export class CounterpartyListDto {
  @ApiProperty({ type: [CounterpartySummaryDto] })
  counterparties!: CounterpartySummaryDto[];

  @ApiProperty({ type: String, example: '2026-10-13T11:00:00.000+09:00', description: 'When the verdicts were computed (Asia/Seoul)' })
  evaluated_at!: string;
}

export class EligibilityCounterpartyDto {
  @ApiProperty({ type: String, format: 'uuid' })
  counterparty_id!: string

  @ApiProperty({ type: String })
  display_name!: string

  @ApiProperty({ type: Boolean })
  is_active!: boolean
}

export class EligibilityContactDto {
  @ApiProperty({ type: String, format: 'uuid' })
  contact_id!: string

  @ApiProperty({ type: String })
  person_name!: string

  @ApiProperty({ type: Boolean })
  is_active!: boolean
}

export class ContactEligibilityDto {
  @ApiProperty({ type: AddressStatusDto })
  address!: AddressStatusDto;

  @ApiProperty({ type: EligibilityContactDto })
  contact!: EligibilityContactDto;

  @ApiProperty({ type: EligibilityCounterpartyDto })
  counterparty!: EligibilityCounterpartyDto;

  @ApiProperty({ type: Boolean, description: 'true only when every condition passes and no dev safety reason applies' })
  eligible!: boolean

  @ApiProperty({ type: [GateConditionDto], description: 'All six FR-ELG-01 conditions, always in this order' })
  conditions!: GateConditionDto[];

  @ApiProperty({ type: [GateReasonDto], description: 'Every blocking reason (not only the first)' })
  reasons!: GateReasonDto[];

  @ApiProperty({ type: Boolean, description: 'Whether the test recipient allowlist applied (real channel outside production)' })
  dev_safety_applied!: boolean;

  @ApiProperty({ type: String, example: '2026-10-13T11:00:00.000+09:00' })
  evaluated_at!: string
}

export class FacilitySummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  facility_id!: string;

  @ApiProperty({ enum: FACILITY_TYPE })
  facility_type!: (typeof FACILITY_TYPE)[number];

  @ApiProperty({ type: String })
  facility_name!: string;

  @ApiProperty({ type: String, nullable: true })
  area!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'The counterparty that operates this facility — capacity inquiries and receiving requests go only to its contacts. Null = not registered: nobody is asked (no guessing by role)' })
  operator_counterparty_id!: string | null;
}

export class SetFacilityOperatorRequestDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Counterparty id whose role matches the facility type (ODCY · WAREHOUSE), or null to clear' })
  counterparty_id!: string | null;
}

export class FacilityListDto {
  @ApiProperty({ type: [FacilitySummaryDto] })
  facilities!: FacilitySummaryDto[];
}

/** T-127 거래처 등록 요청 */
export class CreateCounterpartyRequestDto {
  @ApiProperty({ type: String, maxLength: 100 })
  display_name!: string;
  @ApiProperty({ enum: COUNTERPARTY_ROLE })
  source_role!: (typeof COUNTERPARTY_ROLE)[number];
  @ApiProperty({ type: String, maxLength: 30, required: false })
  org_code?: string;
}

/** T-127 연락처 + 주소 등록 요청. 주소는 UNVERIFIED · 관계 PENDING 으로 시작한다(자동 승인 없음) */
export class CreateContactRequestDto {
  @ApiProperty({ type: String, maxLength: 60 })
  person_name!: string;
  @ApiProperty({ type: String, maxLength: 60, required: false })
  team?: string;
  @ApiProperty({ type: String, maxLength: 200, required: false })
  note?: string;
  @ApiProperty({ enum: ['GMAIL', 'MOCK'], description: 'MOCK = simulated mailbox (scenario runs) · GMAIL = real channel (live runs)' })
  channel_type!: 'GMAIL' | 'MOCK';
  @ApiProperty({ type: String, maxLength: 200, description: 'E-mail address; stored trimmed and lower-cased' })
  address!: string;
}
