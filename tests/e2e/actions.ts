import { expect, type Locator, type Page } from '@playwright/test';

// Exercise the application's explicit confirmation step before asserting its effects.
export async function confirmAction(page: Page, trigger: Locator) {
  const label = (await trigger.textContent())?.trim() ?? '';
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toBeHidden();
}
