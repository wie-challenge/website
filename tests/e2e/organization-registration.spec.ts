import { expect, test } from '@playwright/test';

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
  await expect(page.getByText('Synthetic Company · TEST-REG-2026')).toBeVisible();
});
