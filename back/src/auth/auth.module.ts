import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminUsersController, AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthMiddleware } from './auth.middleware.js';
import { AuthService } from './auth.service.js';

/** 사람 로그인 · 권한(T-119). API 프로세스에만 붙는다(Worker 는 HTTP 가 없다). */
@Module({
  controllers: [AuthController, AdminUsersController],
  providers: [AuthService, AuthMiddleware, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
