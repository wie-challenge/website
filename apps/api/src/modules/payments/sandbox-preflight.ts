import 'reflect-metadata';
import { DhmadSandboxAdapter } from './dhmad.adapter.js';

const key = process.env.DHMAD_API_KEY;
if (!key) {
  console.log(JSON.stringify({ status: 'BLOCKED_CREDENTIALS', message: 'DHMAD_API_KEY not set.' }));
  process.exit(0);
}

const adapter = new DhmadSandboxAdapter({
  baseUrl: process.env.DHMAD_BASE_URL ?? 'https://sandbox.dhmad.tn/api',
  apiKey: key,
  webhookSecret: process.env.DHMAD_WEBHOOK_SECRET,
});

const account = await adapter.verifyAccountAssociation();
console.log(
  JSON.stringify({
    status: account.associatedAccountVerified
      ? 'AUTHENTICATED_SANDBOX_PASS'
      : 'BLOCKED_PERMISSIONS',
    environment: account.environment,
    authenticated: account.authenticated,
    associatedAccountVerified: account.associatedAccountVerified,
    permissions: account.permissions,
    associatedBalanceAvailableTnd: account.associatedBalanceAvailableTnd ?? null,
  }),
);
if (!account.associatedAccountVerified) {
  process.exitCode = 1;
}
