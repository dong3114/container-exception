import { defineConfig } from 'vitest/config';

// unit: DB·네트워크 없이 도는 시험. db: 로컬 PostgreSQL(infra/local)이 필요한 시험.
// db 시험은 같은 데이터베이스를 쓰므로 파일을 순서대로 돌린다.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'db',
          include: ['test/db/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
