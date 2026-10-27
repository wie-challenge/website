import { expect, test } from '@playwright/test';

const progressKey = 'nasj.presentation.scene.v1'; // gitleaks:allow -- Public local-storage namespace, never a credential.

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 960 },
]) {
  test(`presentation navigation, notes, resume and evidence on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/presentation');
    const deck = page.locator('[data-presentation-scene]');
    await expect(deck).toHaveAttribute('data-presentation-scene', 'problem');
    await expect(page.getByRole('complementary', { name: 'Presenter notes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '← Previous' })).toBeDisabled();
    await expect(page.getByRole('progressbar')).toHaveAttribute('max', '10');

    // Keyboard navigation works from scene content and moves focus to its heading.
    await page
      .getByRole('heading', { name: 'Beautiful work. A difficult route to market.' })
      .focus();
    await page.keyboard.press('ArrowRight');
    await expect(deck).toHaveAttribute('data-presentation-scene', 'opportunity');
    await expect(
      page.getByRole('heading', { name: 'A managed B2B path, with clear commitments.' }),
    ).toBeFocused();
    await page.keyboard.press('Space');
    await expect(deck).toHaveAttribute('data-presentation-scene', 'concept');
    await page.keyboard.press('ArrowLeft');
    await expect(deck).toHaveAttribute('data-presentation-scene', 'opportunity');

    // Native controls keep their own keyboard semantics, without global advances.
    const jump = page.getByRole('combobox', { name: 'Go to scene' });
    await jump.selectOption('3');
    await expect(deck).toHaveAttribute('data-presentation-scene', 'workflow');
    const stage = page.getByRole('button', { name: /Voluntary acceptance/ });
    await stage.focus();
    await page.keyboard.press('Space');
    await expect(stage).toHaveAttribute('aria-pressed', 'true');
    await expect(deck).toHaveAttribute('data-presentation-scene', 'workflow');
    await expect(
      page.getByText(
        'Only the artisan’s authorized acceptance creates their production commitment.',
      ),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Show speaker notes on this screen' }).click();
    const notes = page.getByRole('complementary', { name: 'Presenter notes' });
    await expect(notes).toBeVisible();
    for (const term of [
      'Objective',
      'Main message',
      'Suggested narration',
      'Timing',
      'Demo action',
      'Supporting evidence',
      'Limitations',
    ]) {
      await expect(notes.getByText(term, { exact: true })).toBeVisible();
    }
    await page.reload();
    await expect(deck).toHaveAttribute('data-presentation-scene', 'workflow');
    await expect(notes).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), progressKey)).toBe('3');

    for (let index = 0; index < 10; index++) {
      await jump.selectOption(String(index));
      const scene = page.locator('article[data-presentation-slide][data-scene-active="true"]');
      await expect(scene.locator('[data-evidence-status]')).toBeVisible();
      await expect(scene.getByRole('link', { name: 'Source and limitations' })).toHaveAttribute(
        'href',
        /^\/evidence#/,
      );
      const animation = await scene.evaluate((node) => getComputedStyle(node).animationName);
      expect(animation).toBe('none');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await jump.selectOption('8');
    await page.getByText('Change financial assumptions', { exact: true }).focus();
    await page.keyboard.press('Space');
    const quantity = page.getByRole('textbox', { name: 'Order quantity' });
    await expect(quantity).toBeVisible();
    await quantity.focus();
    await page.keyboard.press('ArrowRight');
    await expect(deck).toHaveAttribute('data-presentation-scene', 'finance');
    await jump.selectOption('9');
    await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(deck).toHaveAttribute('data-presentation-scene', 'problem');
    await page.reload();
    await expect(deck).toHaveAttribute('data-presentation-scene', 'problem');
  });
}

test('presentation fullscreen uses the browser API, preserves progress and hides notes', async ({
  page,
}) => {
  await page.goto('/presentation');
  await page.getByRole('combobox', { name: 'Go to scene' }).selectOption('5');
  await page.getByRole('button', { name: 'Show speaker notes on this screen' }).click();
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Presenter notes' })).toHaveCount(0);
  await expect(
    page.locator(
      'article[data-presentation-slide][data-scene-active="true"] [data-evidence-status]',
    ),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.locator('[data-presentation-scene]')).toHaveAttribute(
    'data-presentation-scene',
    'technology',
  );
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
});

test('presentation ignores malformed resume data and prints evidence without notes', async ({
  page,
}) => {
  await page.goto('/presentation');
  await page.evaluate(
    (key) => localStorage.setItem(key, '{"scene":999,"name":"private"}'),
    progressKey,
  );
  await page.reload();
  await expect(page.locator('[data-presentation-scene]')).toHaveAttribute(
    'data-presentation-scene',
    'problem',
  );
  await page.getByRole('button', { name: 'Show speaker notes on this screen' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('article[data-presentation-slide]:visible')).toHaveCount(10);
  await expect(page.locator('[data-claim-id="presentation.transparency"]')).toContainText(
    'not field evidence',
  );
  await expect(page.getByRole('complementary', { name: 'Presenter notes' })).toBeHidden();
});
