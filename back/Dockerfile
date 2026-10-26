# CERA Main Backend (NestJS) — API · Worker · migration 이 한 이미지를 쓴다(명령만 다르다).
# 빌드 맥락 = back/ . 실행 맥락 = /srv/back, 데이터 폴더(../data)는 compose 가 /srv/data 로 붙인다.
# 개발·시험 의존성(tsx · drizzle-kit · vitest)을 남겨 둔다: 같은 이미지로 db:migrate · db:seed · 시험을 돌린다.
FROM node:22-slim
WORKDIR /srv/back
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3100
CMD ["node", "dist/main.js"]
