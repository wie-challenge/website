import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import * as C from '@nasj/contracts';
import { z } from 'zod';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { FinanceService } from './finance.service.js';
const rid = new ZodValidationPipe(C.resourceIdSchema);
@Controller('api/v1/finance')
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly service: FinanceService) {}
  @Get('my-statement') statement(@CurrentUser() actor: Actor) {
    return this.service.statement(actor);
  }
  @Get('orders/:id/closure') closure(@CurrentUser() actor: Actor, @Param('id', rid) id: string) {
    return this.service.closure(actor, id);
  }
  @Post('orders/:id/closure') assess(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(z.object({}).strict())) _input: Record<string, never>,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.closure(actor, id, true, key);
  }
  @Get('orders/:id') workspace(@CurrentUser() actor: Actor, @Param('id', rid) id: string) {
    return this.service.workspace(actor, id);
  }
  @Post('orders/:id/deposits') deposit(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.depositRecordSchema)) input: z.infer<
      typeof C.depositRecordSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.deposit(actor, id, input, key);
  }
  @Post('deposits/:id/review') reviewDeposit(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.depositReviewSchema)) input: z.infer<
      typeof C.depositReviewSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.reviewDeposit(actor, id, input, key);
  }
  @Post('orders/:id/payouts') requestPayout(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.payoutRequestSchema)) input: z.infer<
      typeof C.payoutRequestSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.requestPayout(actor, id, input, key);
  }
  @Post('payouts/:id/approve') approvePayout(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.financeReasonSchema)) input: z.infer<
      typeof C.financeReasonSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.approvePayout(actor, id, input, key);
  }
  @Post('payouts/:id/executions') execution(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.payoutExecutionSchema)) input: z.infer<
      typeof C.payoutExecutionSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.execution(actor, id, input, key);
  }
  @Post('orders/:id/disputes') dispute(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.paymentDisputeSchema)) input: z.infer<
      typeof C.paymentDisputeSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.dispute(actor, id, input, key);
  }
  @Post('disputes/:id/review') reviewDispute(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.disputeReviewSchema)) input: z.infer<
      typeof C.disputeReviewSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.reviewDispute(actor, id, input, key);
  }
  @Post('orders/:id/adjustments') adjustment(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.adjustmentProposalSchema)) input: z.infer<
      typeof C.adjustmentProposalSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.adjustment(actor, id, input, key);
  }
  @Post('adjustments/:id/approve') approveAdjustment(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.financeReasonSchema)) input: z.infer<
      typeof C.financeReasonSchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.approveAdjustment(actor, id, input, key);
  }
}
