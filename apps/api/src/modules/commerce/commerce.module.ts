import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module.js';
import { CommerceController } from './commerce.controller.js';
import { CommerceService } from './commerce.service.js';
import { ProcurementController } from '../procurement/procurement.controller.js';
import { ProcurementService } from '../procurement/procurement.service.js';
@Module({
  imports: [FoundationModule],
  controllers: [CommerceController, ProcurementController],
  providers: [CommerceService, ProcurementService],
})
export class CommerceModule {}