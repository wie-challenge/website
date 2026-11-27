import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaymentProviderRegistry } from './provider.factory.js';
import { ReconciliationService } from './reconciliation.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentProviderRegistry, PaymentsService, WebhooksService, ReconciliationService],
  exports: [PaymentProviderRegistry, PaymentsService, WebhooksService, ReconciliationService],
})
export class PaymentsModule {}
