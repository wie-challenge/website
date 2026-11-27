import 'reflect-metadata';
import { DhmadSandboxAdapter } from './dhmad.adapter.js';

const key = process.env.DHMAD_API_KEY;
if (!key) {
  console.log(JSON.stringify({ status: 'BLOCKED_CREDENTIALS', message: 'DHMAD_API_KEY not set.' }));
  process.exit(0);
}

const expectedSellerEmail = process.env.DHMAD_EXPECTED_SELLER_EMAIL?.trim().toLowerCase();
if (!expectedSellerEmail) {
  console.log(
    JSON.stringify({
      status: 'BLOCKED_RECIPIENT_CONFIG',
      message: 'DHMAD_EXPECTED_SELLER_EMAIL is required for fail-closed recipient verification.',
    }),
  );
  process.exit(1);
}

const adapter = new DhmadSandboxAdapter({
  baseUrl: process.env.DHMAD_BASE_URL ?? 'https://sandbox.dhmad.tn/api',
  apiKey: key,
  webhookSecret: process.env.DHMAD_WEBHOOK_SECRET,
});

const account = await adapter.verifyAccountAssociation();
const missingPermissions = account.missingPermissions ?? [];
const recipientMatches =
  Boolean(account.developerEmail) && account.developerEmail!.toLowerCase() === expectedSellerEmail;
const ready =
  account.associatedAccountVerified &&
  Boolean(account.escrowReadVerified) &&
  missingPermissions.length === 0 &&
  recipientMatches;

const status = !recipientMatches
  ? 'BLOCKED_RECIPIENT_MISMATCH'
  : ready
    ? 'AUTHENTICATED_SANDBOX_PASS'
    : 'BLOCKED_PERMISSIONS';

console.log(
  JSON.stringify({
    status,
    environment: account.environment,
    authenticated: account.authenticated,
    associatedAccountVerified: account.associatedAccountVerified,
    escrowReadVerified: Boolean(account.escrowReadVerified),
    recipientMatches,
    permissions: account.permissions,
    missingPermissions,
    associatedBalanceAvailableTnd: account.associatedBalanceAvailableTnd ?? null,
  }),
);
if (!ready) {
  process.exitCode = 1;
}
