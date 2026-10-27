import { test, expect } from '@playwright/test';

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 960 },
]) {
  test(`truthful public concept and evidence navigation on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('clearer path to market');
    await expect(page.locator('[data-claim-id="landing.market-hypothesis"]')).toHaveAttribute(
      'data-evidence-status',
      'PROPOSED',
    );
    await expect(page.locator('[data-claim-id="landing.software-workflow"]')).toHaveAttribute(
      'data-evidence-status',
      'SYNTHETIC',
    );
    await expect(page.locator('[data-claim-id="landing.local-safety"]')).toContainText(
      'No clinical',
    );
    await expect(page.getByRole('link', { name: 'Explore the synthetic demo' })).toHaveAttribute(
      'href',
      '/demo',
    );
    await expect(page.getByRole('link', { name: 'Presentation mode' })).toHaveAttribute(
      'href',
      '/presentation',
    );
    await page.getByRole('link', { name: 'Evidence and limitations', exact: true }).click();
    await expect(page).toHaveURL(/\/evidence$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'demonstration can establish',
    );
    await expect(page.locator('#methodology')).toContainText(
      'No measurement or verification publication authority',
    );
    await expect(page.locator('#payments')).toContainText('Verified paid remains zero');
    await expect(page.locator('#producer-share')).toContainText('not verified paid income');
    await expect(page.locator('#limitations')).toContainText('owner acceptance', {
      ignoreCase: true,
    });
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noOverflow).toBe(true);
    await page.goto('/presentation');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A prototype you can inspect.',
    );
    await expect(page.locator('[data-claim-id="presentation.problem"]')).toBeVisible();
    await expect(page.locator('[data-claim-id="presentation.problem"]')).toHaveAttribute(
      'data-evidence-status',
      'PROPOSED',
    );
    await page.getByRole('combobox', { name: 'Go to scene' }).selectOption('7');
    await expect(page.locator('[data-claim-id="presentation.transparency"]')).toHaveAttribute(
      'data-evidence-status',
      'SYNTHETIC',
    );
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('[data-claim-id="presentation.transparency"]')).toBeVisible();
    await expect(page.locator('[data-claim-id="presentation.transparency"]')).toContainText(
      'not field evidence',
    );
    await page.emulateMedia({ media: 'screen' });
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
  });
}
