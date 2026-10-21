import { Body, Controller, Get, Header, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import * as C from '@hirfacare/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { CommerceService } from '../commerce/commerce.service.js';
import { ProcurementService } from './procurement.service.js';
const rid = new ZodValidationPipe(C.resourceIdSchema);
const pages = new ZodValidationPipe(C.procurementPageSchema);
@Controller('api/v1/procurement')
export class ProcurementController {
  constructor(
    @Inject(ProcurementService) private readonly service: ProcurementService,
    @Inject(CommerceService) private readonly commerce: CommerceService,
  ) {}
  @Get('discussions') discussions(
    @CurrentUser() a: Actor,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.discussions(a, q.page);
  }
  @Post('rfqs/:id/close') close(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementCloseSchema)) i: z.infer<
      typeof C.procurementCloseSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.close(a, id, i, k);
  }
  @Get('rfqs') list(
    @CurrentUser() a: Actor,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.list(a, q.page);
  }
  @Post('rfqs') create(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.rfqCreateSchema)) i: C.RfqCreate,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.commerce.createRfq(a, i, k, true);
  }
  @Get('rfqs/:id') detail(@CurrentUser() a: Actor, @Param('id', rid) id: string) {
    return this.service.detail(a, id);
  }
  @Get('rfqs/:id/activity') activity(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.history(a, id, q.page, 'activity');
  }
  @Get('rfqs/:id/revisions') revisions(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.history(a, id, q.page, 'revisions');
  }
  @Post('rfqs/:id/submit') submit(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementVersionSchema)) i: { version: number },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.commerce.rfqAction(a, id, { ...i, next: 'SUBMITTED' }, k);
  }
  @Post('rfqs/:id/review') review(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementVersionSchema)) i: { version: number },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.review(a, id, i, k);
  }
  @Post('rfqs/:id/revisions') revise(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementReviseSchema)) i: z.infer<
      typeof C.procurementReviseSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.revise(a, id, i, k);
  }
  @Post('rfqs/:id/attachments') attach(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementAttachmentSchema)) i: z.infer<
      typeof C.procurementAttachmentSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.attach(a, id, i, k);
  }
  @Post('rfqs/:id/attachments/:fileId/remove') remove(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('fileId', rid) f: string,
    @Body(new ZodValidationPipe(C.procurementVersionSchema)) i: { version: number },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.removeAttachment(a, id, f, i, k);
  }
  @Get('rfqs/:id/attachments/:fileId/token') token(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('fileId', rid) f: string,
  ) {
    return this.service.attachmentToken(a, id, f);
  }
  @Get('rfqs/:id/attachments/:fileId/content') content(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('fileId', rid) f: string,
    @Query(new ZodValidationPipe(z.object({ token: z.string().min(1).max(2000) }).strict())) q: {
      token: string;
    },
  ) {
    return this.service.attachment(a, id, f, q.token);
  }
  @Post('rfqs/:id/questions') question(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementQuestionSchema)) i: { question: string },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.question(a, id, i, k);
  }
  @Post('rfqs/:id/questions/:questionId/answer') answer(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('questionId', rid) q: string,
    @Body(new ZodValidationPipe(C.procurementAnswerSchema)) i: { answer: string },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.answer(a, id, q, i, k);
  }
  @Get('rfqs/:id/thread') thread(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.thread(a, id, q.page);
  }
  @Post('rfqs/:id/thread') message(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementMessageSchema)) i: z.infer<
      typeof C.procurementMessageSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.postMessage(a, id, i, k);
  }
  @Post('rfqs/:id/samples') sample(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementSampleSchema)) i: z.infer<
      typeof C.procurementSampleSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.sample(a, id, i, k);
  }
  @Post('rfqs/:id/sample-decisions') decision(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementDecisionSchema)) i: z.infer<
      typeof C.procurementDecisionSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.decideSample(a, id, i, k);
  }
  @Post('rfqs/:id/quotes') quote(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementQuoteSchema)) i: z.infer<
      typeof C.procurementQuoteSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.quote(a, id, i, k);
  }
  @Post('rfqs/:id/accept') accept(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementAcceptSchema)) i: z.infer<
      typeof C.procurementAcceptSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.accept(a, id, i, k);
  }
  @Post('rfqs/:id/documents') issue(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementDocumentSchema)) i: z.infer<
      typeof C.procurementDocumentSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.issueDocument(a, id, i, k);
  }
  @Get('documents') documents(
    @CurrentUser() a: Actor,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.documents(a, q.page);
  }
  @Get('documents/:id/download') @Header('Cache-Control', 'no-store') download(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.service.downloadDocument(a, id);
  }
  @Post('rfqs/:id/products') publish(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementProductSchema)) i: z.infer<
      typeof C.procurementProductSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.publishProduct(a, id, i, k);
  }
  @Get('products') products(
    @CurrentUser() a: Actor,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.products(a, q.page);
  }
  @Post('products/:id/status') status(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementProductStatusSchema)) i: z.infer<
      typeof C.procurementProductStatusSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.productStatus(a, id, i, k);
  }
  @Post('products/:id/reorder') reorder(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementReorderSchema)) i: z.infer<
      typeof C.procurementReorderSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.reorder(a, id, i, k);
  }
}
