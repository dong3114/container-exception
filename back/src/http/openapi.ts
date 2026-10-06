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
        },
      },
    },
  };
  return document;
}

/** `GET /openapi.json` — 생성된 문서를 그대로 내보낸다(Swagger UI 는 두지 않는다). */
export function serveOpenApi(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  const http = app.getHttpAdapter();
  http.get(OPENAPI_PATH, (_req: unknown, res: { json(body: unknown): void }) => res.json(document));
}
