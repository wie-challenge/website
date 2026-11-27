import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { DhmadSandboxAdapter } from './dhmad.adapter.js';
import { DeterministicMockPaymentProvider } from './mock-provider.js';
import type { PaymentProvider } from './provider.types.js';

@Injectable()
export class PaymentProviderRegistry {
  private readonly provider: PaymentProvider;
  private readonly mockInstance: DeterministicMockPaymentProvider;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.mockInstance = new DeterministicMockPaymentProvider(
      config.DHMAD_WEBHOOK_SECRET ?? 'mock_sandbox_webhook_secret_32chars',
    );
    if (config.PAYMENT_PROVIDER === 'dhmad') {
      this.provider = new DhmadSandboxAdapter({
        baseUrl: config.DHMAD_BASE_URL,
        apiKey: config.DHMAD_API_KEY,
        webhookSecret: config.DHMAD_WEBHOOK_SECRET,
        allowLoopbackForTest: config.NODE_ENV === 'test',
      });
    } else {
      this.provider = this.mockInstance;
    }
  }

  getProvider(): PaymentProvider {
    return this.provider;
  }

  getMockForTesting(): DeterministicMockPaymentProvider {
    return this.mockInstance;
  }

  isEnabled(): boolean {
    return this.config.PAYMENTS_ENABLED && this.config.NODE_ENV !== 'production';
  }
}
