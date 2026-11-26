import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
for (const viewport of [
  { label: 'mobile', width: 360, height: 800 },
  { label: 'desktop', width: 1280, height: 900 },
]) {
  test(`NASJ landing, branding and account navigation work on ${viewport.label}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({
      reducedMotion: viewport.label === 'mobile' ? 'reduce' : 'no-preference',
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Meaningful gifts');
    await expect(page.getByRole('link', { name: 'NASJ | نسج', exact: true }).first()).toBeVisible();
    let result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await test.info().attach(`nasj-landing-${viewport.label}`, {
      body: JSON.stringify({ violations: result.violations }),
      contentType: 'application/json',
    });
    expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.local/nasj-landing-${viewport.label}.png`, fullPage: true });
    const email = `nasj-menu-${viewport.label}@example.com`,
      password = 'Synthetic-commerce-browser-password-2026!';
    expect(
      (
        await request.post('/api/auth/sign-up/email', {
          headers: { Origin: 'http://127.0.0.1:3100' },
          data: { email, name: 'NASJ menu persona', password },
        })
      ).status(),
    ).toBe(202);
    const { token } = await (
      await request.get(`${process.env.E2E_CONTROL_URL}/token?email=${encodeURIComponent(email)}`)
    ).json();
    expect(
      (await request.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)).status(),
    ).toBe(200);
    await page.goto('/auth/login?next=%2Fsettings%2Fprofile');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/settings\/profile/);
    const profile = page.getByRole('link', { name: 'Your profile', exact: true });
    await profile.focus();
    await expect(profile).toBeFocused();
    await profile.press('Enter');
    await expect(page).toHaveURL(/settings\/profile/);
    await expect(
      page.getByRole('heading', { name: 'Personal details', exact: true }),
    ).toBeVisible();
    result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await test.info().attach(`nasj-menu-${viewport.label}`, {
      body: JSON.stringify({ violations: result.violations }),
      contentType: 'application/json',
    });
    expect(result.violations).toEqual([]);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/auth\/login/);
    await page.screenshot({ path: `.local/nasj-account-${viewport.label}.png`, fullPage: true });
  });
}
