import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  imports: [FoundationModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
