import { Module } from '@nestjs/common';
import { CommerceController } from './commerce.controller.js';
import { CommerceService } from './commerce.service.js';
import { ProcurementController } from '../procurement/procurement.controller.js';
import { ProcurementService } from '../procurement/procurement.service.js';
@Module({
  controllers: [CommerceController, ProcurementController],
  providers: [CommerceService, ProcurementService],
})
export class CommerceModule {}
