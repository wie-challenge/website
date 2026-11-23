import { expect, test } from '@playwright/test';
import { totp } from './totp';

test('company registration survives a blocked session lookup and a dropped save response', async ({
  page,
}) => {
  const origin = 'http://127.0.0.1:3100';
  const email = 'company-registration@example.com';
  const password = 'Synthetic-company-registration-password-2026!';
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers,
        data: { name: 'Test Applicant', email, password },
      })
    ).status(),
  ).toBe(202);
  const { token } = await (
    await page.request.get(
      `${process.env.E2E_CONTROL_URL}/token?email=${encodeURIComponent(email)}`,
    )
  ).json();
  expect(
    (await page.request.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', { headers, data: { email, password } })
    ).status(),
  ).toBe(200);

  await page.goto('/welcome');
  await page.getByRole('button', { name: /Create a company/ }).click();
  const form = page.getByRole('dialog', { name: 'Register your company' });
  await form.getByLabel('Legal organization name').fill('Synthetic Company');
  await form.getByLabel('Company registration number').fill('TEST-REG-2026');
  await form.getByLabel('Representative’s full name').fill('Test Applicant');
  await form.getByLabel('Region').fill('Tunis');
  await form.getByLabel('Contact email').fill(email);
  await form.getByLabel(/What does the organization do/).fill('Sources local handmade products.');
  // The page already has a session proof. A blocked browser lookup must not prevent registration.
  await page.route('**/api/v1/me', (route) => route.abort());
  const save = form.getByRole('button', { name: 'Save and continue' });
  await page.route('**/api/v1/organizations', (route) => route.abort(), { times: 1 });
  await save.click();
  await expect(form.getByRole('alert')).toContainText(
    'We couldn’t confirm that your draft was saved',
  );
  await expect(form.getByLabel('Company registration number')).toHaveValue('TEST-REG-2026');

  await page.route(
    '**/api/v1/organizations',
    async (route) => {
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(201);
      await route.abort();
    },
    { times: 1 },
  );
  await save.click();
  await expect(page.getByRole('heading', { name: 'Finish your application' })).toBeVisible();
  await page.reload();
  if (process.env.E2E_REQUIRE_PRIVILEGED_MFA === '1') {
    await expect(page.getByText('Your draft is saved.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Organization registration', { exact: true })).toHaveCount(0);
    await page.getByLabel('Password for authenticator setup').fill(password);
    await page.getByRole('button', { name: 'Set up authenticator' }).click();
    await expect(page.getByRole('img', { name: 'Authenticator setup QR code' })).toBeVisible();
    const uri = await page.getByLabel('Authenticator setup URI').inputValue();
    await page.getByLabel('Six-digit authenticator code').fill(totp(uri));
    await page.getByRole('button', { name: 'Confirm authenticator code' }).click();
    await expect(page.getByRole('img', { name: 'Authenticator setup QR code' })).toHaveCount(0);
    const registration = page.getByLabel('Organization registration', { exact: true });
    await registration.setInputFiles({
      name: 'test-registration.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n% Synthetic test fixture'),
    });
    await page
      .locator('form')
      .filter({ has: registration })
      .getByRole('button', { name: 'Save PDF' })
      .click();
    await expect(page.getByRole('link', { name: 'test-registration.pdf' })).toBeVisible();
  }
  await expect(page.getByText('Synthetic Company · TEST-REG-2026')).toBeVisible();
});
