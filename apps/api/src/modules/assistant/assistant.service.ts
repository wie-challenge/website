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
    const broker = this.config.ASSISTANT_AMQP_URL;
    if (!this.config.ASSISTANT_LIVE_ENABLED || !broker)
      fail(503, 'ASSISTANT_NOT_CONFIGURED', 'Live Nasouj replies are not configured.');
    if (this.active.has(actor.id) || this.active.size >= 20)
      fail(429, 'ASSISTANT_BUSY', 'Please wait before starting another conversation.');
    this.active.add(actor.id);
    const abort = new AbortController();
    let transport: Awaited<ReturnType<typeof openAssistantTransport>> | undefined;
    const disconnected = () => abort.abort();
    const requestId = randomUUID();
    const deadline = Date.now() + this.config.ASSISTANT_TIMEOUT_MS;
    let outcome: string = 'disconnected';
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
      outcome = code;
      if (res.headersSent) send({ version: 1, requestId, seq, type: 'error', code });
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
      stop('ASSISTANT_TIMEOUT');
      abort.abort();
    }, this.config.ASSISTANT_TIMEOUT_MS);
    try {
      const context = await Promise.race([this.access.context(actor), finished]);
      abort.signal.throwIfAborted();
      if (!context) return;
      const pending = this.openTransport(broker, abort.signal).then(async (opened) => {
        if (abort.signal.aborted) {
          await opened.close();
          return;
        }
        transport = opened;
        return opened;
      });
      const opened = await Promise.race([pending, finished]);
      abort.signal.throwIfAborted();
      if (!opened) return;
      const request = assistantRequestSchema.parse({
        version: 1,
        requestId,
        deadline,
        personas: context.personas,
        chat,
      });
      await Promise.race([
        finished,
        opened.start(
          requestId,
          request,
          (event) => {
            if (complete) return;
            if (event.seq !== seq || ++count > 4096) {
              stop('ASSISTANT_UNAVAILABLE');
              return;
            }
            if (!res.headersSent && event.type !== 'delta') {
              stop(event.type === 'error' ? event.code : 'ASSISTANT_UNAVAILABLE');
              return;
            }
            if (event.type === 'delta') {
              length += event.text.length;
              if (length > 16000) {
                stop('ASSISTANT_UNAVAILABLE');
                return;
              }
            }
            if (!res.headersSent) {
              res.status(200).set({
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-store, no-transform',
                'X-Accel-Buffering': 'no',
              });
              res.flushHeaders();
            }
            send(event);
            seq += 1;
            if (event.type !== 'delta') {
              outcome = event.type === 'done' ? 'done' : event.code;
              complete = true;
              finish();
            }
          },
          () => stop('ASSISTANT_UNAVAILABLE'),
        ),
      ]);
      await finished;
      if (!res.headersSent && !res.destroyed && outcome !== 'disconnected')
        fail(503, 'ASSISTANT_UNAVAILABLE', 'Nasouj is temporarily unavailable.');
    } catch {
      if (!abort.signal.aborted && outcome === 'disconnected') outcome = 'ASSISTANT_UNAVAILABLE';
      if (!res.headersSent && !res.destroyed && outcome !== 'disconnected')
        fail(503, 'ASSISTANT_UNAVAILABLE', 'Nasouj is temporarily unavailable.');
      if (res.headersSent) stop('ASSISTANT_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
      res.removeListener('close', disconnected);
      this.active.delete(actor.id);
      logger.info({ requestId, outcome }, 'Nasouj request finished');
      if (res.headersSent && !res.destroyed && !res.writableEnded) res.end();
      void transport?.close().catch(() => {});
    }
  }
}
