# CERA 공개 포트폴리오 보안 헤더(T-131) — nginx.conf 가 include 한다. HSTS 는 HTTPS 종단(Caddyfile)이 붙인다.
# 화면은 같은 출처의 정적 파일 · /backend 만 쓴다(외부 CDN · 글꼴 없음). React 의 style 속성 때문에 style-src 에 'unsafe-inline' 이 필요하다.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Frame-Options "DENY" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
