import { parseArgs } from 'node:util';
import { MockChannelAdapter, type SimulatedReply } from '../channel/mock-channel-adapter.js';
import { loadDotEnvIfPresent, parseEnv } from '../config/env.js';
import { UuidV7Generator } from '../shared/id/uuid.js';
import { SystemClock } from '../shared/time/clock.js';

/**
 * **개발 · 시험 전용** — Mock 상대 업체가 답장한 것처럼 Mock 수신함에 메일 한 통을 넣는다. 제품 API 가 아니다.
 * production 에서는 거부한다. Worker 가 다음 주기에 이 메일을 가져간다(수신 처리는 실제 코드 그대로).
 *
 *   npm run mock:reply -- --reply-to <CERA message id>                 # 보낸 그 주소가 같은 스레드로 답함
 *   npm run mock:reply -- --reply-to <id> --from stranger@example.invalid   # 미등록 발신자 → 보류
 *   npm run mock:reply -- --from someone@example.invalid --subject "문의"   # 스레드 밖 메일 → 보류
 *   옵션: --body "…" · --date "<Date 헤더 원문>" · --no-date · --received-at <ISO> · --external-thread <id>
 */
function main(): void {
  loadDotEnvIfPresent();
  const env = parseEnv(process.env);
  if (env.APP_ENV === 'production') throw new Error('mock:reply is a development tool and is disabled in production');
  const { values } = parseArgs({
    options: {
      'reply-to': { type: 'string' },
      from: { type: 'string' },
      body: { type: 'string' },
      subject: { type: 'string' },
      date: { type: 'string' },
      'no-date': { type: 'boolean' },
      'received-at': { type: 'string' },
      'external-thread': { type: 'string' },
    },
  });
  const options: SimulatedReply = {
    replyToCeraMessageId: values['reply-to'] ?? null,
    ...(values.from ? { from: values.from } : {}),
    ...(values.body ? { body: values.body } : {}),
    ...(values.subject ? { subject: values.subject } : {}),
    ...(values['no-date'] ? { dateHeader: null } : values.date ? { dateHeader: values.date } : {}),
    ...(values['received-at'] ? { channelReceivedAt: values['received-at'] } : {}),
    ...(values['external-thread'] ? { externalThreadId: values['external-thread'] } : {}),
  };
  const adapter = new MockChannelAdapter(env.CERA_MOCK_CHANNEL_DIR, new UuidV7Generator(), new SystemClock());
  adapter
    .simulateReply(options)
    .then((r) => console.log(JSON.stringify({ injected: r.external_message_id, from: r.headers.From, thread: r.external_thread_id, in_reply_to: r.headers['In-Reply-To'] ?? null })))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
