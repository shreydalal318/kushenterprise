import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { buildDocumentHtml } from './template';
import type { DocModel } from './types';

/**
 * Server-side HTML → A4 PDF with headless Chromium. One browser per process, one page per render.
 * Set CHROMIUM_PATH in production if Chromium isn't in a standard location.
 */
let browser: Promise<Browser> | null = null;

function executablePath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) if (existsSync(p)) return p;
  return undefined; // Playwright's own download (`npx playwright install chromium`)
}

function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = chromium.launch({ executablePath: executablePath(), args: ['--no-sandbox', '--font-render-hinting=none'] }).catch((e) => {
      browser = null;
      throw e;
    });
    void browser.then((b) => b.on('disconnected', () => { browser = null; }));
  }
  return browser;
}

export async function renderDocumentPdf(doc: DocModel): Promise<Buffer> {
  const html = buildDocumentHtml(doc);
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction('window.__invoiceReady === true', undefined, { timeout: 15_000 });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
}

export async function closePdfBrowser() {
  if (browser) await (await browser).close().catch(() => {});
  browser = null;
}
