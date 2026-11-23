import type { Page } from '@playwright/test';

export const shots = process.env.E2E_SCREENSHOTS;
export const snap = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

export async function login(page: Page, identifier: string, password: string, { expectFail = false } = {}) {
  await page.goto('/login');
  await page.getByLabel('Email or mobile').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (!expectFail) await page.waitForURL((u) => !u.pathname.startsWith('/login'), { waitUntil: 'commit' });
}

/** Pick a <select> option by (partial) visible text. */
export async function selectByText(page: Page, label: string | RegExp, text: string) {
  const select = page.getByLabel(label, { exact: typeof label === 'string' }).first();
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value!);
}
