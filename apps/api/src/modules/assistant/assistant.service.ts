import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { assistantRequestSchema, type AssistantChat, type AssistantEvent } from '@nasj/contracts';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { fail } from '../../common/errors.js';
import type { Actor } from '../../common/identity.js';
import { logger } from '../../common/logging.js';
import { AccessService } from '../foundation/access.service.js';
import { openAssistantTransport } from './assistant.transport.js';

@Injectable()
export class AssistantService {
  private readonly active = new Set<string>();
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AccessService) private readonly access: AccessService,
    @Optional()
    @Inject('ASSISTANT_TRANSPORT')
    private readonly openTransport: typeof openAssistantTransport = openAssistantTransport,
  ) {}

  async stream(actor: Actor, chat: AssistantChat, res: Response) {
    if (!this.config.ASSISTANT_AMQP_URL)
      fail(503, 'ASSISTANT_UNAVAILABLE', 'Nasouj is temporarily unavailable.');
    if (this.active.has(actor.id) || this.active.size >= 20)
      fail(429, 'ASSISTANT_BUSY', 'Please wait before starting another conversation.');
    this.active.add(actor.id);
    const abort = new AbortController();
    let transport: Awaited<ReturnType<typeof openAssistantTransport>> | undefined;
    const disconnected = () => abort.abort();
    const requestId = randomUUID();
    let seq = 0;
    let length = 0;
    let count = 0;
    let complete = false;
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const send = (event: AssistantEvent) => {
      if (complete || res.destroyed || res.writableEnded) return;
      if (!res.write(`${JSON.stringify(event)}\n`)) abort.abort();
    };
    const stop = (code: 'ASSISTANT_UNAVAILABLE' | 'ASSISTANT_TIMEOUT') => {
      if (complete) return;
      send({ version: 1, requestId, seq, type: 'error', code });
      complete = true;
      finish();
    };
    abort.signal.addEventListener(
      'abort',
      () => {
        complete = true;
        finish();
      },
      { once: true },
    );
    res.once('close', disconnected);
    const timeout = setTimeout(() => {
      if (res.headersSent) stop('ASSISTANT_TIMEOUT');
      abort.abort();
    }, this.config.ASSISTANT_TIMEOUT_MS);
    try {
      const context = await this.access.context(actor);
      abort.signal.throwIfAborted();
      transport = await this.openTransport(this.config.ASSISTANT_AMQP_URL, abort.signal);
      abort.signal.throwIfAborted();
      const request = assistantRequestSchema.parse({
        version: 1,
        requestId,
        deadline: Date.now() + this.config.ASSISTANT_TIMEOUT_MS,
        personas: context.personas,
        chat,
      });
      res.status(200).set({
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      logger.info(
        { requestId, access: 'authenticated', personaCount: context.personas.length },
        'Nasouj access allowed',
      );
      await transport.start(
        requestId,
        request,
        (event) => {
          if (complete) return;
          if (event.seq !== seq || ++count > 4096) {
            stop('ASSISTANT_UNAVAILABLE');
            return;
          }
          if (event.type === 'delta') {
            length += event.text.length;
            if (length > 16000) {
              stop('ASSISTANT_UNAVAILABLE');
              return;
            }
          }
          send(event);
          seq += 1;
          if (event.type !== 'delta') {
            complete = true;
            finish();
          }
        },
        () => stop('ASSISTANT_UNAVAILABLE'),
      );
      await finished;
    } catch {
      if (!res.headersSent && !res.destroyed)
        fail(503, 'ASSISTANT_UNAVAILABLE', 'Nasouj is temporarily unavailable.');
      if (res.headersSent) stop('ASSISTANT_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
      res.removeListener('close', disconnected);
      await transport?.close();
      this.active.delete(actor.id);
      if (res.headersSent && !res.destroyed && !res.writableEnded) res.end();
    }
  }
}
