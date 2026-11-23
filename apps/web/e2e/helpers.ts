import type { APIRequestContext, Page } from '@playwright/test';

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

/** Call a tRPC procedure as the signed-in user (superjson wire format). */
export async function trpc<T = unknown>(req: APIRequestContext, path: string, input: unknown, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const res = method === 'POST'
    ? await req.post(`/api/trpc/${path}`, { data: { json: input }, headers: { 'content-type': 'application/json' } })
    : await req.get(`/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`);
  const body = await res.json();
  if (!res.ok()) throw new Error(`${path}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.result.data.json as T;
}

/** A valid random GTIN-14 so re-runs never collide. */
export function randomGtin() {
  const body = `0${Math.floor(1e11 + Math.random() * 9e11)}`.padEnd(13, '7').slice(0, 13);
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(body[12 - i]) * (i % 2 === 0 ? 3 : 1);
  return body + ((10 - (sum % 10)) % 10);
}
