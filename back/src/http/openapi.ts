import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * OpenAPI 뼈대(R-01 — T-085 에서 이월, U1).
 * - 계약의 정본은 Main Backend 코드다. 문서는 Nest 의 컨트롤러 메타데이터에서 **생성**한다(손으로 쓰지 않는다)
 * - Frontend 는 Backend 내부 타입을 import 하지 않는다 — 생성된 문서(`packages/contracts/openapi.json`)와
 *   그것에서 만든 클라이언트·타입만 본다(생성 파이프라인은 프론트 연결 U10 에서)
 * - 공통 오류 응답 `{ code, message, request_id }`(docs/23 12절)를 공용 스키마로 둔다
 * 지금 경로는 health 뿐이다 — 업무 endpoint 는 U2(T-087)부터 더한다.
 */
export const OPENAPI_PATH = '/openapi.json';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('CERA Main Backend API')
    .setDescription('CERA (Container Exception Recovery Agent) Main Backend. Times are ISO 8601 with +09:00; KRW amounts are decimal integer strings.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  sortParameters(document);
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      ErrorResponse: {
        type: 'object',
        required: ['code', 'message', 'request_id'],
        properties: {
          code: { type: 'string', pattern: '^[A-Z][A-Z0-9_]*$', description: 'Stable error code' },
          message: { type: 'string', description: 'Safe human-readable message (no secrets, no raw content)' },
          request_id: { type: 'string', nullable: true, description: 'UUIDv7 request id (X-Request-Id)' },
          details: { type: 'object', additionalProperties: true, description: 'Structured next-step information for some business errors (e.g. missing_inputs for PLANNING_INPUT_UNAVAILABLE)' },
        },
      },
    },
  };
  return document;
}

const PARAMETER_ORDER: Record<string, number> = { path: 0, query: 1, header: 2, cookie: 3 };

/**
 * 매개변수 순서를 고정한다(경로 → 쿼리 → 헤더, 같은 곳이면 이름순). decorator 를 읽는 순서가 실행기(tsx · vitest)마다
 * 달라 같은 코드에서 다른 문서가 나오면 "계약이 최신인가" 검사가 흔들린다(T-089 — 헤더 매개변수가 처음 생겼다).
 */
function sortParameters(document: OpenAPIObject): void {
  for (const item of Object.values(document.paths)) {
    for (const op of Object.values(item) as { parameters?: { in?: string; name?: string }[] }[]) {
      if (!op || !Array.isArray(op.parameters)) continue;
      op.parameters.sort(
        (a, b) => (PARAMETER_ORDER[a.in ?? ''] ?? 9) - (PARAMETER_ORDER[b.in ?? ''] ?? 9) || (a.name ?? '').localeCompare(b.name ?? ''),
      );
    }
  }
}

/** `GET /openapi.json` — 생성된 문서를 그대로 내보낸다(Swagger UI 는 두지 않는다). */
export function serveOpenApi(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  const http = app.getHttpAdapter();
  http.get(OPENAPI_PATH, (_req: unknown, res: { json(body: unknown): void }) => res.json(document));
}
