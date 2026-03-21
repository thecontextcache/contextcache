import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/', '/auth', '/waitlist', '/legal'];

for (const route of ROUTES) {
  test(`a11y smoke ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    const result = await new AxeBuilder({ page })
      .disableRules(['color-contrast']) // covered by token contrast script for now
      .analyze();
    const serious = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(serious, `serious/critical violations on ${route}`).toEqual([]);
  });
}

test('dialog keyboard escape smoke', async ({ page }) => {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  expect(page.url()).toContain('/auth');
});

test('landing faq is keyboard operable', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const faqButton = page.getByRole('button', { name: 'What is a memory card?' });
  await faqButton.focus();
  await page.keyboard.press('Enter');
  await expect(faqButton).toHaveAttribute('aria-expanded', 'true');
});

for (const route of ['/app', '/admin', '/brain']) {
  test(`protected route redirects to auth: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/auth$/);
  });
}
