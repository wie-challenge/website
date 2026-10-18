import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module.js';
import { MailModule } from '../mail/mail.module.js';
import { GovernanceService } from './governance.service.js';
import { GovernanceController } from './governance.controller.js';
@Module({
  imports: [FoundationModule, MailModule],
  providers: [GovernanceService],
  controllers: [GovernanceController],
})
export class GovernanceModule {}
