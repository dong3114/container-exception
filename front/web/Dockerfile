# CERA Control Tower (Vite + React SPA, CSR only — ADR-035) — 시연 · 전체 재현용 이미지.
# Vite build → 정적 파일 → nginx. 개발 중 HMR 은 이 이미지가 아니라 호스트의 `npm run dev` 를 쓴다(docs/16 3절).
#
# 빌드 맥락 = 저장소 루트(front/web 이 ../../data/scenarios 와 ../../packages/contracts 를 참조한다).
#   docker build -f front/web/Dockerfile .      (compose 가 이 맥락으로 부른다)
# 브라우저 → /backend/* → nginx → Main Backend(api:3100). 브라우저는 Backend 만 부른다(docs/23 7.1). VITE_* 는 번들에 들어가므로 비밀값 금지.
FROM node:22-slim AS build
WORKDIR /repo/front/web
COPY front/web/package.json front/web/package-lock.json ./
RUN npm ci
COPY front/web/ ./
COPY data/scenarios /repo/data/scenarios
COPY packages/contracts /repo/packages/contracts
ARG VITE_CERA_API_BASE=/backend
ARG VITE_CERA_PROVIDER=mock
ENV VITE_CERA_API_BASE=$VITE_CERA_API_BASE VITE_CERA_PROVIDER=$VITE_CERA_PROVIDER
RUN npm run build

FROM nginx:1.27-alpine
COPY front/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/front/web/dist /usr/share/nginx/html
EXPOSE 80
