import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { assertDemoResource } from '../../src/modules/commerce/commerce.service.js';

const actor = {
  id: 'demo-user',
  role: 'USER' as const,
  isDemo: true,
  sessionId: 'demo-session',
  sessionCreatedAt: new Date(),
  sessionExpiresAt: new Date(Date.now() + 60_000),
};

test('demo actors are rejected from live commercial resources', () => {
  assert.throws(
    () => assertDemoResource(actor, 'LIVE'),
    (error: unknown) =>
      error instanceof HttpException &&
      error.getStatus() === 403 &&
      (error.getResponse() as { message: string }).message ===
        'Demo credentials cannot access live resources.',
  );
  assert.doesNotThrow(() => assertDemoResource(actor, 'SYNTHETIC'));
});
