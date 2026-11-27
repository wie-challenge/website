import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import * as C from '@nasj/contracts';
import { z } from 'zod';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { PaymentsService } from './payments.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { WebhooksService } from './webhooks.service.js';

const rid = new ZodValidationPipe(C.resourceIdSchema);

@Controller('api/v1/payments')
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(ReconciliationService) private readonly reconciliation: ReconciliationService,
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
  ) {}

  @Get('provider/status')
  providerStatus(@CurrentUser() actor: Actor) {
    return this.payments.providerStatus(actor);
  }

  @Post('b2c/orders/:id/financial-plan')
  approveB2cPlan(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.b2cAllocationPlanSchema))
    input: z.infer<typeof C.b2cAllocationPlanSchema>,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payments.approveB2cAllocationPlan(actor, id, input, key);
  }

  @Post('b2c/orders/:id/financial-plan/draft')
  draftB2cPlan(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.b2cAllocationPlanSchema))
    input: z.infer<typeof C.b2cAllocationPlanSchema>,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payments.draftB2cAllocationPlan(actor, id, input, key);
  }

  @Post('b2c/orders/:id/financial-plan/approve')
  approveB2cDraft(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.approveB2cDraftSchema))
    input: z.infer<typeof C.approveB2cDraftSchema>,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payments.approveB2cAllocationDraft(actor, id, input, key);
  }

  @Post('obligations')
  createObligation(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(C.createPaymentObligationSchema))
    input: z.infer<typeof C.createPaymentObligationSchema>,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payments.createObligationAndEscrow(actor, input, key);
  }

  @Get('obligations/:id')
  getObligation(@CurrentUser() actor: Actor, @Param('id', rid) id: string) {
    return this.payments.getObligation(actor, id);
  }

  @Get('orders/:channel/:id/obligations')
  listForOrder(
    @CurrentUser() actor: Actor,
    @Param('channel', new ZodValidationPipe(z.enum(['B2C', 'B2B']))) channel: 'B2C' | 'B2B',
    @Param('id', rid) id: string,
  ) {
    return this.payments.listObligationsForOrder(actor, channel, id);
  }

  @Post('obligations/:id/checkout-sessions')
  createCheckoutSession(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.createCheckoutSessionSchema))
    input: z.infer<typeof C.createCheckoutSessionSchema>,
  ) {
    return this.payments.createCheckoutSession(actor, id, input);
  }

  @Post('checkout-sessions/:id/sync')
  syncCheckoutSession(@CurrentUser() actor: Actor, @Param('id', rid) id: string) {
    return this.payments.syncCheckoutSession(actor, id);
  }

  @Post('obligations/:id/deliver')
  deliverEscrow(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.deliverEscrowSchema))
    input: z.infer<typeof C.deliverEscrowSchema>,
  ) {
    return this.payments.declareDelivery(actor, id, input);
  }

  @Post('obligations/:id/cancel')
  cancelPendingEscrow(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.cancelEscrowSchema))
    input: z.infer<typeof C.cancelEscrowSchema>,
  ) {
    return this.payments.cancelPendingEscrow(actor, id, input);
  }

  @Post('artisans/:id/kyc')
  initiateKyc(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.initiateKycSchema))
    input: z.infer<typeof C.initiateKycSchema>,
  ) {
    return this.payments.initiateArtisanKyc(actor, id, input);
  }

  @Get('artisans/:id/kyc')
  kycStatus(@CurrentUser() actor: Actor, @Param('id', rid) id: string) {
    return this.payments.artisanKycStatus(actor, id);
  }

  @Post('kyc/:id/review')
  reviewKyc(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.reviewKycSchema))
    input: z.infer<typeof C.reviewKycSchema>,
  ) {
    return this.payments.reviewArtisanKyc(actor, id, input);
  }

  @Get('artisan/me')
  myArtisanFinance(@CurrentUser() actor: Actor) {
    return this.payments.myArtisanFinance(actor);
  }

  @Post('payout-simulations')
  simulatePayout(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(C.simulatePayoutSchema))
    input: z.infer<typeof C.simulatePayoutSchema>,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payments.simulatePayout(actor, input, key);
  }

  @Post('disputes/:id/reply')
  replyDispute(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.providerDisputeReplySchema))
    input: z.infer<typeof C.providerDisputeReplySchema>,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payments.replyToProviderDispute(actor, id, input.body, key);
  }

  @Get('ledger/trial-balance')
  trialBalance(@CurrentUser() actor: Actor) {
    return this.payments.ledgerTrialBalance(actor);
  }

  @Post('reconciliation/run')
  runReconciliation(@CurrentUser() actor: Actor) {
    return this.reconciliation.run(actor);
  }

  @Get('reconciliation/runs')
  reconciliationRuns(@CurrentUser() actor: Actor) {
    return this.reconciliation.listRuns(actor);
  }

  @Get('reconciliation/discrepancies')
  discrepancies(@CurrentUser() actor: Actor, @Query('status') status?: string) {
    return this.reconciliation.listDiscrepancies(actor, status);
  }

  @Post('reconciliation/discrepancies/:id/resolve')
  resolveDiscrepancy(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.resolveDiscrepancySchema))
    input: z.infer<typeof C.resolveDiscrepancySchema>,
  ) {
    return this.reconciliation.resolveDiscrepancy(actor, id, input);
  }

  @Get('webhooks/inbox')
  webhookInbox(@CurrentUser() actor: Actor, @Query('status') status?: string) {
    return this.webhooks.listInbox(actor, status);
  }

  @Post('webhooks/inbox/:id/replay')
  replayWebhook(@CurrentUser() actor: Actor, @Param('id', rid) id: string) {
    return this.webhooks.replayQuarantined(actor, id);
  }
}
