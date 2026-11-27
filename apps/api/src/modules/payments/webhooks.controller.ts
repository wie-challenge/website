import { Controller, Headers, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/identity.js';
import { WebhooksService } from './webhooks.service.js';

type RawBodyRequest = Request & { rawBody?: string };

@Controller('api/v1/webhooks')
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly webhooks: WebhooksService) {}

  // nosemgrep: nasj-public-route -- External DHMAD webhook receiver authenticated via HMAC-SHA256 signature and 5-minute replay timestamp window.
  @Public()
  @Post('dhmad')
  @HttpCode(200)
  receiveDhmad(
    @Req() req: RawBodyRequest,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-webhook-id') webhookId?: string,
    @Headers('x-webhook-event') eventHeader?: string,
  ) {
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body ?? {});
    return this.webhooks.ingest({
      rawBody,
      parsedBody: req.body,
      signature,
      timestamp,
      webhookId,
      eventHeader,
    });
  }
}
