import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { logger } from '../../common/logging.js';
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly transport;
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      requireTLS: config.SMTP_REQUIRE_TLS,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
      connectionTimeout: 5000,
      socketTimeout: 10000,
    });
  }
  private readonly pending = new Set<Promise<unknown>>();
  send(to: string, subject: string, text: string) {
    const delivery = this.transport
      .sendMail({ from: this.config.EMAIL_FROM, to, subject, text })
      .catch(() => {
        logger.error(
          { category: 'AUTH_MAIL_DELIVERY' },
          'Authentication email delivery failed; check SMTP configuration.',
        );
      })
      .finally(() => {
        this.pending.delete(delivery);
      });
    this.pending.add(delivery);
  }
  async sendConfirmed(to: string, subject: string, text: string) {
    try {
      const result = await this.transport.sendMail({
        from: this.config.EMAIL_FROM,
        to,
        subject,
        text,
      });
      return result.accepted.some((address) => String(address).toLowerCase() === to.toLowerCase());
    } catch {
      logger.error({ category: 'NOTIFICATION_SMTP_FAILURE' }, 'Notification submission failed.');
      return false;
    }
  }
  async onModuleDestroy() {
    await Promise.allSettled(this.pending);
    this.transport.close();
  }
}
