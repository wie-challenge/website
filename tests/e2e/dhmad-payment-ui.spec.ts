import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const baseUrl = process.env.DHMAD_E2E_BASE_URL;
const password = process.env.DHMAD_E2E_PASSWORD ?? 'Sandbox-test-password-2026!';

test.skip(!baseUrl, 'Requires DHMAD_E2E_BASE_URL pointing to a running DHMAD sandbox stack.');

test.use({
  baseURL: baseUrl,
  actionTimeout: 15000,
  launchOptions: {
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  },
});

async function login(page: Page, email: string, next: string) {
  await page.context().clearCookies();
  const apiUrl = process.env.DHMAD_API_URL ?? 'http://127.0.0.1:3002';
  const origin = process.env.DHMAD_TRUSTED_ORIGIN ?? 'https://primal-landed-magnify.ngrok-free.dev';
  const res = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
    headers: { Origin: origin },
    data: { email, password },
  });
  expect(res.status()).toBe(200);
  await page.goto(next);
  await expect(page).toHaveURL(new RegExp(`${next.replaceAll('/', '\\/')}$`));
}

async function assertAccessibleAndResponsive(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopAxe = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(desktopAxe.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(mobileOverflow).toBe(true);
  const mobileAxe = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(mobileAxe.violations).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 800 });
}

test('buyer B2C and B2B payment views enforce tenant isolation, 3-decimal TND, FR/AR RTL, a11y, and mobile', async ({
  page,
}) => {
  await login(page, 'sandbox-buyer@example.com', '/orders/cmwyx7vuj0000u4e4g84e1foi');

  const panel = page.getByRole('region', { name: 'Escrow and payment' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('25.000 TND');
  await expect(panel).toContainText('Settled');
  await expect(panel).toContainText('Matched');
  await expect(panel).not.toContainText('600.000');
  await expect(panel).not.toContainText('artisanProfileId');

  // Verify French and Arabic RTL localization
  const langSelect = panel.getByLabel('Payment panel language');
  await langSelect.selectOption('fr');
  await expect(panel).toHaveAttribute('dir', 'ltr');
  await expect(panel).toContainText('Séquestre et paiement (Bac à sable uniquement)');

  await langSelect.selectOption('ar');
  await expect(panel).toHaveAttribute('dir', 'rtl');
  await expect(panel).toContainText('الضمان والدفع (بيئة الاختبار فقط)');

  await langSelect.selectOption('en');
  await assertAccessibleAndResponsive(page);

  // B2B procurement order check: buyer must not see internal artisan allocations or costs
  await page.goto('/procurement/cmwyw0dic0012q9e4m82agsg7');
  await page.getByRole('tab', { name: 'Finances', exact: true }).click();
  const b2bPanel = page.getByRole('region', { name: 'Escrow and payment' });
  await expect(b2bPanel).toBeVisible();
  await expect(b2bPanel).toContainText('2000.000 TND');
  await expect(b2bPanel).toContainText('Fully signed: Yes');
  await expect(page.locator('main').last()).not.toContainText(
    'Request financial plan and artisan allocations',
  );
  await assertAccessibleAndResponsive(page);
});

test('artisan finance view exposes only own allocations, simulated payouts, FR/AR RTL, a11y, and mobile', async ({
  page,
}) => {
  await login(page, 'sandbox-artisan-a@example.com', '/artisan/profile');

  const section = page.locator('#kyc-and-earnings');
  await expect(section).toBeVisible();
  await expect(section).toContainText('600.000 TND');
  await expect(section).toContainText('30%');
  await expect(section).toContainText('SIMULATED PAYOUT');
  await expect(section).not.toContainText('500.000 TND');
  await expect(section).not.toContainText('2000.000 TND');

  const langSelect = section.getByLabel('Payment panel language');
  await langSelect.selectOption('fr');
  await expect(section).toHaveAttribute('dir', 'ltr');
  await expect(section).toContainText('Vérification d’identité (KYC) et vos revenus');

  await langSelect.selectOption('ar');
  await expect(section).toHaveAttribute('dir', 'rtl');
  await expect(section).toContainText('التحقق من الهوية (KYC) ومستحقاتك');

  await langSelect.selectOption('en');
  await assertAccessibleAndResponsive(page);
});

test('finance/admin operations view renders trial balance, reconciliation, webhooks, a11y, and mobile', async ({
  page,
}) => {
  await login(page, 'sandbox-maker@example.com', '/operator/finance');

  const main = page.locator('main').last();
  await expect(main).toContainText('Financial subledger trial balance');
  await expect(main).toContainText('Reconciliation');
  await expect(main).toContainText('Durable webhook inbox');
  await assertAccessibleAndResponsive(page);
});
