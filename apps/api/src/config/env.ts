import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { config as dotenv } from 'dotenv';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((value) => value === 'true');
const positive = z.coerce.number().int().min(1).max(1000000);
const optional = (value: unknown) => (value === '' ? undefined : value);
export function trustedNetwork(value: string) {
  const [address, mask, extra] = value.split('/');
  const family = isIP(address);
  return Boolean(
    family &&
      extra === undefined &&
      (mask === undefined ||
        (/^\d+$/.test(mask) && Number(mask) >= 1 && Number(mask) <= (family === 4 ? 32 : 128))),
  );
}
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PUBLIC_APP_URL: z
    .url()
    .refine(
      (value) =>
        new URL(value).origin === value && !new URL(value).username && !new URL(value).password,
      'Use one HTTP(S) origin without a path or trailing slash.',
    )
    .refine((value) => /^https?:\/\//.test(value)),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(?:ql)?:\/\//.test(value), 'Use a PostgreSQL URL.'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(48)
    .refine(
      (value) => !/generate|replace|example/i.test(value),
      'Generate a random authentication secret.',
    ),
  TRUST_PROXY: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .refine(
      (values) => values.every(trustedNetwork),
      'Use explicit proxy IPs/CIDRs; never true, hop counts or wildcards.',
    ),
  DEMO_MODE: bool.default(false),
  REQUIRE_PRIVILEGED_MFA: bool.default(false),
  ARCJET_ENABLED: bool.default(false),
  ARCJET_KEY: z.preprocess(optional, z.string().optional()),
  ARCJET_MODE: z.enum(['DRY_RUN', 'LIVE']).default('DRY_RUN'),
  ARCJET_FAILURE_MODE: z.enum(['closed', 'open']).default('closed'),
  RATE_LOGIN_MAX: positive.default(10),
  RATE_LOGIN_WINDOW: positive.default(60),
  RATE_REGISTRATION_MAX: positive.default(5),
  RATE_REGISTRATION_WINDOW: positive.default(3600),
  RATE_RESET_MAX: positive.default(5),
  RATE_RESET_WINDOW: positive.default(3600),
  RATE_VERIFICATION_MAX: positive.default(10),
  RATE_VERIFICATION_WINDOW: positive.default(3600),
  RATE_API_MAX: positive.default(120),
  RATE_API_WINDOW: positive.default(60),
  RATE_ADMIN_MAX: positive.default(30),
  RATE_ADMIN_WINDOW: positive.default(60),
  RATE_FEEDBACK_MAX: positive.default(8),
  RATE_FEEDBACK_WINDOW: positive.default(300),
  NOTIFICATION_EMAIL_ENABLED: bool.default(false),
  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1026),
  SMTP_SECURE: bool.default(false),
  SMTP_REQUIRE_TLS: bool.default(false),
  SMTP_USER: z.preprocess(optional, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(optional, z.string().optional()),
  EMAIL_FROM: z.string().min(3).default('NASJ <noreply@nasj.local>'),
  ASSISTANT_AMQP_URL: z.preprocess(
    optional,
    z
      .url()
      .refine((v) => /^amqps?:\/\//.test(v))
      .optional(),
  ),
  ASSISTANT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(60000),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
  PAYMENTS_ENABLED: bool.default(false),
  PAYMENT_PROVIDER: z.enum(['mock', 'dhmad']).default('mock'),
  DHMAD_ENVIRONMENT: z.enum(['sandbox']).default('sandbox'),
  DHMAD_BASE_URL: z.preprocess(
    optional,
    z
      .url()
      .refine((v) => /^https?:\/\//.test(v))
      .optional(),
  ),
  DHMAD_API_KEY: z.preprocess(optional, z.string().min(8).optional()),
  DHMAD_WEBHOOK_SECRET: z.preprocess(optional, z.string().min(16).optional()),
  DHMAD_EXPECTED_SELLER_EMAIL: z.preprocess(
    optional,
    z
      .email()
      .transform((v) => v.toLowerCase())
      .optional(),
  ),
  DHMAD_CHECKOUT_RETURN_URL: z.preprocess(optional, z.url().optional()),
  PAYMENT_B2C_REVIEW_HOURS: z.coerce.number().int().min(24).max(336).default(72),
  PAYMENT_B2B_REVIEW_HOURS: z.coerce.number().int().min(24).max(336).default(168),
  PAYMENT_RECONCILIATION_ENABLED: bool.default(false),
  ARTISAN_PAYOUT_MODE: z.enum(['simulation']).default('simulation'),
  REAL_PAYOUTS_ENABLED: bool.default(false),
});
export function validateEnvironment(values: Record<string, unknown>) {
  const parsed = envSchema.safeParse(values);
  if (!parsed.success)
    throw new Error(
      `Invalid environment fields: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const config = parsed.data;
  if (config.REAL_PAYOUTS_ENABLED)
    throw new Error('REAL_PAYOUTS_ENABLED must remain false; real artisan payouts are disabled.');
  if (config.DHMAD_API_KEY?.startsWith('sk_live_'))
    throw new Error('Live DHMAD API keys (sk_live_) are forbidden in sandbox-only integration.');
  if (config.DHMAD_BASE_URL) {
    const base = new URL(config.DHMAD_BASE_URL);
    const isSandbox = base.origin === 'https://sandbox.dhmad.tn';
    const isLocalTest =
      config.NODE_ENV === 'test' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
    if (!isSandbox && !isLocalTest)
      throw new Error('DHMAD_BASE_URL must target https://sandbox.dhmad.tn (or loopback in test).');
  }
  if (config.DHMAD_CHECKOUT_RETURN_URL) {
    const returnUrl = new URL(config.DHMAD_CHECKOUT_RETURN_URL);
    if (returnUrl.origin !== config.PUBLIC_APP_URL)
      throw new Error('DHMAD_CHECKOUT_RETURN_URL must share the PUBLIC_APP_URL origin.');
  }
  if (config.PAYMENTS_ENABLED && config.PAYMENT_PROVIDER === 'dhmad') {
    if (!config.DHMAD_API_KEY?.startsWith('sk_sandbox_'))
      throw new Error(
        'DHMAD_API_KEY with sk_sandbox_ prefix is required when PAYMENT_PROVIDER=dhmad.',
      );
    if (!config.DHMAD_EXPECTED_SELLER_EMAIL)
      throw new Error('DHMAD_EXPECTED_SELLER_EMAIL is required when PAYMENT_PROVIDER=dhmad.');
  }
  if (config.ARCJET_ENABLED && !config.ARCJET_KEY)
    throw new Error('ARCJET_KEY is required when ARCJET_ENABLED=true.');
  if (
    config.DEMO_MODE &&
    (new URL(config.DATABASE_URL).pathname !== '/nasj_demo' ||
      config.NODE_ENV === 'production' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.DATABASE_URL).hostname) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.PUBLIC_APP_URL).hostname) ||
      !['127.0.0.1', 'localhost', '::1'].includes(config.API_HOST))
  )
    throw new Error(
      'Demo mode requires the isolated nasj_demo database and nonproduction environment.',
    );
  if (config.NODE_ENV === 'production') {
    if (config.PAYMENTS_ENABLED)
      throw new Error(
        'Production financial execution is disabled until a separate activation mission.',
      );
    if (new URL(config.DATABASE_URL).pathname === '/nasj_demo')
      throw new Error('Production cannot use the synthetic showroom database.');
    if (!config.REQUIRE_PRIVILEGED_MFA)
      throw new Error('Production requires REQUIRE_PRIVILEGED_MFA=true.');
    if (!config.PUBLIC_APP_URL.startsWith('https://'))
      throw new Error('Production PUBLIC_APP_URL requires HTTPS.');
    if (!config.ARCJET_ENABLED || !config.ARCJET_KEY)
      throw new Error('Production requires configured Arcjet protection.');
    if (config.ARCJET_MODE !== 'LIVE') throw new Error('Production requires ARCJET_MODE=LIVE.');
    if (
      (!config.SMTP_REQUIRE_TLS && !config.SMTP_SECURE) ||
      !config.SMTP_USER ||
      !config.SMTP_PASSWORD
    )
      throw new Error('Production requires authenticated TLS SMTP.');
  }
  return config;
}
export function loadConfig() {
  dotenv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
  return validateEnvironment(process.env);
}
export type AppConfig = ReturnType<typeof validateEnvironment>;
export const APP_CONFIG = Symbol('APP_CONFIG');
