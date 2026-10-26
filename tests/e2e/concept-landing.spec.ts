import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const viewport of [
  { label: 'mobile', width: 360, height: 800 },
  { label: 'desktop', width: 1280, height: 900 },
]) {
  test(`concept landing is accessible and navigable on ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/concept');

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Proposed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Synthetic', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Simulated', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Explore the synthetic catalog' }).first(),
    ).toHaveAttribute('href', '/commerce/catalog');
    await expect(
      page.getByRole('link', { name: 'Open the buyer workspace' }).first(),
    ).toHaveAttribute('href', '/commerce/buyer');
    await expect(page.getByText('Presentation mode · TODO(team)').last()).toBeVisible();
    await expect(page.locator('#local-safety-track')).toContainText('not defined or tested yet');

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const lightAudit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await test.info().attach(`concept-${viewport.label}-light-axe`, {
      body: JSON.stringify({ violations: lightAudit.violations }),
      contentType: 'application/json',
    });
    expect(lightAudit.violations).toEqual([]);

    await page.emulateMedia({ colorScheme: 'dark' });
    const darkAudit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await test.info().attach(`concept-${viewport.label}-dark-axe`, {
      body: JSON.stringify({ violations: darkAudit.violations }),
      contentType: 'application/json',
    });
    expect(darkAudit.violations).toEqual([]);

    if (viewport.width === 360) {
      const menuButton = page.getByRole('button', { name: 'Open navigation', exact: true });
      await menuButton.focus();
      await menuButton.press('Enter');
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      const mobileMenu = page.locator('#concept-mobile-menu');
      await expect(mobileMenu).toBeVisible();
      await expect(
        mobileMenu.getByRole('link', { name: 'The problem', exact: true }),
      ).toBeVisible();

      const openMenuAudit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(openMenuAudit.violations).toEqual([]);

      await mobileMenu.getByRole('link', { name: 'The problem', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      await expect(menuButton).toBeFocused();
      await expect(mobileMenu).toBeHidden();

      await menuButton.press('Enter');
      await mobileMenu.getByRole('link', { name: 'Evidence and limits', exact: true }).click();
      await expect(page).toHaveURL(/#evidence$/);
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    }
  });
}
