// Generates the invoice mock-ups as self-contained HTML + A4 PDF (+ PNG previews).
// Usage: node generate.mjs [--copies original,duplicate,triplicate]

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import QRCode from 'qrcode';
import { computeInvoice } from './lib.mjs';
import { buildInvoiceHtml } from './template.mjs';
import { sampleIntra, sampleInter } from './samples.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outDir = join(here, 'out');
rmSync(outDir, { recursive: true, force: true }); // no stale page previews from earlier runs
mkdirSync(outDir, { recursive: true });

const copiesArg = process.argv.indexOf('--copies');
const copiesOverride = copiesArg > -1 ? process.argv[copiesArg + 1].split(',') : null;

const dataUri = (path, mime) => `data:${mime};base64,${readFileSync(path).toString('base64')}`;

function fontCss() {
  const dir = dirname(require.resolve('@fontsource/inter/package.json'));
  const faces = [];
  for (const file of ['400.css', '400-italic.css', '600.css', '600-italic.css', '700.css']) {
    const css = readFileSync(join(dir, file), 'utf8');
    for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
      const m = block.match(/files\/(inter-(latin|latin-ext)-\d+-(normal|italic)\.woff2)/);
      if (!m) continue;
      const woff2 = dataUri(join(dir, 'files', m[1]), 'font/woff2');
      faces.push(block.replace(/src:[^;]*;/, `src: url(${woff2}) format('woff2');`));
    }
  }
  return faces.join('\n');
}

const assets = {
  fontCss: fontCss(),
  logoPrimary: dataUri(join(here, '../../brand/logo-primary-lockup-trim.png'), 'image/png'),
};

// Use the pre-installed Chromium when present; otherwise Playwright's own download.
const { chromium } = require('playwright');
const preinstalled = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(preinstalled) && !process.env.PW_USE_BUNDLED
  ? { executablePath: preinstalled } : {});

for (const sample of [sampleIntra, sampleInter]) {
  const inv = computeInvoice({ ...sample, copies: copiesOverride || sample.copies });
  // Placeholder UPI payload; becomes a real upi://pay link once the UPI ID is configured.
  const upi = `upi://pay?pa=UPI-ID-PLACEHOLDER&pn=Kush%20Enterprise&am=${inv.total}.00&cu=INR&tn=${encodeURIComponent(inv.number)}`;
  const html = buildInvoiceHtml(inv, {
    ...assets,
    upiQr: await QRCode.toDataURL(upi, { margin: 0, width: 300, errorCorrectionLevel: 'M' }),
  });
  const htmlPath = join(outDir, `${sample.file}.html`);
  writeFileSync(htmlPath, html);

  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(htmlPath).href);
  await page.waitForFunction(() => window.__invoiceReady === true);
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(outDir, `${sample.file}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });

  // PNG preview of each page (for quick review in chat / README).
  await page.setViewportSize({ width: 794, height: 1123 });
  const pages = await page.$$('section.page');
  for (let i = 0; i < pages.length; i++) {
    await pages[i].screenshot({ path: join(outDir, `${sample.file}-p${i + 1}.png`), scale: 'device' });
  }
  await page.close();
  console.log(`${sample.file}: ${pages.length} page(s), total ₹${inv.total}, tax ₹${inv.totalTax}, roundOff ${inv.roundOff}, ${inv.interState ? 'IGST' : 'CGST+SGST'}`);
}
await browser.close();
