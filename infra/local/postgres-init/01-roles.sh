#!/bin/bash
# CERA 로컬 역할·데이터베이스 준비 (docs/24 12.2). 컨테이너 최초 초기화 때 한 번만 돈다.
#
#   cera_owner : migration 소유 역할. 스키마·표·트리거의 소유자. 앱은 이 역할로 붙지 않는다
#   cera_app   : 실행 앱 역할. 소유자가 아니므로 DDL · 트리거 해제를 할 수 없다
#
# 표 단위 권한(GRANT)은 U1 migration(M10)이 준다. 여기서는 역할 · DB · 접속 권한만.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres \
  -v owner_pw="$CERA_OWNER_PASSWORD" -v app_pw="$CERA_APP_PASSWORD" <<'SQL'
CREATE ROLE cera_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'owner_pw';
CREATE ROLE cera_app   LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_pw';
SQL

for db in "$CERA_DB_NAME" "$CERA_TEST_DB_NAME"; do
  psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres -c "CREATE DATABASE \"$db\" OWNER cera_owner"
  psql -v ON_ERROR_STOP=1 --username postgres --dbname "$db" <<SQL
REVOKE ALL ON DATABASE "$db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE "$db" TO cera_app;
-- public 스키마는 쓰지 않는다(docs/24 2절 — 제품 표는 스키마 cera). 누구도 public 에 객체를 만들지 못하게 한다
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO cera_owner;
SQL
done
