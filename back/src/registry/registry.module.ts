import { Module } from '@nestjs/common';
import { RegistryController } from './registry.controller.js';
import { RegistryService } from './registry.service.js';
import { ContactSelectionRepository } from './contact-selection.repository.js';

/** 등록부 · Contact Gate(T-087 U2). `RegistryReader` 는 전역 PersistenceModule 이 준다. */
@Module({
  controllers: [RegistryController],
  providers: [RegistryService, ContactSelectionRepository],
  exports: [RegistryService, ContactSelectionRepository],
})
export class RegistryModule {}
