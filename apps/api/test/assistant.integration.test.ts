import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium, expect } from '@playwright/test';
import { test } from 'node:test';
import { assistantEventSchema, type AssistantEvent } from '@nasj/contracts';
import { createApp } from '../src/app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { logger } from '../src/common/logging.js';
import { captureMail, disposableDatabase, testConfig } from './support.js';

logger.level = 'silent';
test('authenticated HTTP → RabbitMQ → Python fake worker streams isolated multilingual replies', {
  timeout: 180000,
}, async () => {
  assert.ok(
    process.env.ASSISTANT_AMQP_URL,
    'Start a private test broker and fake Python worker; configure ASSISTANT_AMQP_URL.',
  );
  const database = await disposableDatabase();
  const mail = await captureMail();
  const config = testConfig(database.url, mail.port, {
    ASSISTANT_AMQP_URL: process.env.ASSISTANT_AMQP_URL,
    ...(process.env.NASOUJ_TEST_WEB === '1' ? { PUBLIC_APP_URL: 'http://localhost:3112' } : {}),
  });
  const app = await createApp({ config });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const db = app.get(PrismaService);
    function client() {
      const jar = new Map<string, string>();
      return async (path: string, method = 'GET', body?: unknown, extra = {}) => {
        const response = await fetch(base + path, {
          method,
          headers: {
            Origin: config.PUBLIC_APP_URL,
            'Content-Type': 'application/json',
            Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
            ...extra,
          },
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
          signal: AbortSignal.timeout(70000),
        });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0],
            at = pair.indexOf('=');
          jar.set(pair.slice(0, at), pair.slice(at + 1));
        }
        return response;
      };
    }
    const anon = client();
    const input = { language: 'en', messages: [{ role: 'user', content: 'What is NASJ?' }] };
    assert.equal((await anon('/api/v1/assistant/chat', 'POST', input)).status, 401);
    async function register(index: number) {
      const call = client(),
        email = `assistant-${index}@example.com`;
      const password = 'Nasouj-test-only-password-2026!';
      assert.equal(
        (
          await call('/api/auth/sign-up/email', 'POST', {
            email,
            password,
            name: `Participant ${index}`,
          })
        ).status,
        202,
      );
      // Only this disposable test DB: mark verified without depending on email delivery latency.
      await db.user.update({ where: { email }, data: { emailVerified: true } });
      assert.equal(
        (await call('/api/auth/sign-in/email', 'POST', { email, password })).status,
        200,
      );
      const me = await (await call('/api/v1/me')).json();
      return { call, me, headers: { 'X-CSRF-Token': me.csrfToken } };
    }
    const users = await Promise.all([0, 1, 2].map(register));
    const [a, b] = users;
    assert.equal((await a.call('/api/v1/assistant/chat', 'POST', input)).status, 403);
    assert.equal(
      (
        await a.call(
          '/api/v1/assistant/chat',
          'POST',
          { ...input, userId: b.me.user.id },
          a.headers,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await a.call(
          '/api/v1/assistant/chat',
          'POST',
          { ...input, personas: ['PLATFORM_ADMIN'] },
          a.headers,
        )
      ).status,
      400,
    );
    const ids = new Set<string>();
    await Promise.all(
      users.map(async (user, index) => {
        const language = ['en', 'fr', 'ar'][index];
        const res = await user.call(
          '/api/v1/assistant/chat',
          'POST',
          { ...input, language },
          user.headers,
        );
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') ?? '', /application\/x-ndjson/);
        const events: AssistantEvent[] = (await res.text())
          .trim()
          .split('\n')
          .map((line) => assistantEventSchema.parse(JSON.parse(line)));
        assert.equal(events.at(-1)?.type, 'done');
        const id = events[0].requestId;
        assert.equal(ids.has(id), false);
        ids.add(id);
        assert.ok(events.every((e, i) => e.requestId === id && e.seq === i));
        const text = events.map((e) => (e.type === 'delta' ? e.text : '')).join('');
        assert.ok(
          text.includes(['[Test provider]', '[Fournisseur de test]', '[مزود تجريبي]'][index]),
        );
        assert.equal(text.includes(b.me.user.id), false);
      }),
    );
    if (process.env.NASOUJ_TEST_WEB === '1') {
      const require = createRequire(new URL('../../web/package.json', import.meta.url));
      const next = spawn(
        process.execPath,
        [require.resolve('next/dist/bin/next'), 'dev', '--port', '3112'],
        {
          cwd: new URL('../../web/', import.meta.url),
          detached: true,
          env: {
            ...process.env,
            API_INTERNAL_URL: base,
            PUBLIC_APP_URL: config.PUBLIC_APP_URL,
            NEXT_DIST_DIR: '.next-assistant-test',
          },
          stdio: 'ignore',
        },
      );
      let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
      try {
        browser = await chromium.launch({
          headless: true,
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
        });
        let ready = false;
        for (let i = 0; i < 90; i++) {
          try {
            const res = await fetch(`${config.PUBLIC_APP_URL}/auth/login`, {
              signal: AbortSignal.timeout(1000),
            });
            if (res.ok) {
              ready = true;
              break;
            }
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        assert.equal(ready, true, 'Next.js test server must start');
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(`${config.PUBLIC_APP_URL}/auth/login`);
        await page.getByLabel('Email address', { exact: true }).fill('assistant-2@example.com');
        await page.getByLabel('Password', { exact: true }).fill('Nasouj-test-only-password-2026!');
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        const launch = page.getByRole('button', { name: 'Open Nasouj assistant' });
        await launch.waitFor({ timeout: 30000 });
        await launch.click();
        await page.getByRole('button', { name: 'Français', exact: true }).click();
        await page.getByLabel('Posez votre question à Nasouj').fill('Bonjour Nasouj');
        await page.getByLabel('Posez votre question à Nasouj').press('Enter');
        await expect(page.locator('.nasouj-log')).toContainText('[Fournisseur de test]', {
          timeout: 15000,
        });
        await page.getByRole('button', { name: 'Effacer la conversation' }).click();
        await expect(page.locator('.nasouj-log')).not.toContainText('[Fournisseur de test]');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'العربية', exact: true }).click();
        await page.getByLabel('اطرح سؤالك على نسوج').fill('شنوة ناسج؟');
        await page.getByLabel('اطرح سؤالك على نسوج').press('Enter');
        await expect(page.locator('.nasouj-log')).toContainText('[مزود تجريبي]', {
          timeout: 15000,
        });
        const bounds = await page.locator('.nasouj-panel').boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0);
        await page.screenshot({ path: '/tmp/nasouj-mobile.png' });
        await page.keyboard.press('Escape');
        await expect(launch).toBeFocused();
        console.log(
          'PASS Next.js browser: real login, FR/AR replies, clear, mobile bounds, Escape focus',
        );
      } finally {
        await browser?.close();
        if (next.pid) {
          try {
            process.kill(-next.pid, 'SIGTERM');
          } catch {}
        }
      }
    }
    // Revocation takes effect before any new assistant request can be published.
    await db.user.update({ where: { id: a.me.user.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await a.call('/api/v1/assistant/chat', 'POST', input, a.headers)).status, 403);
  } finally {
    await app.close();
    await mail.stop();
    await database.stop();
  }
});
