import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { Env } from './env.js';

/** 검증된 설정 객체의 DI 토큰. 생성자에서 `@Inject(ENV) env: Env` 로 받는다. */
export const ENV = Symbol('CERA_ENV');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: Object.freeze({ ...env }) }],
      exports: [ENV],
    };
  }
}
