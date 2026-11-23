# Kush Enterprise: Website + Inventory, Ordering & Billing

One system for Kush Enterprise, a supplier of ophthalmic lenses (IOLs) and medical instruments to hospitals, clinics and doctors:

1. **Public website**: company profile, catalogue (no public prices), enquiry form, customer login.
2. **Web app (owner + staff)**: inventory, barcode scanning, orders, proforma, Tally-style GST invoices, purchase orders, customer pricing, employees, analytics.
3. **Mobile app (Android + iOS)**: customer mode and staff mode on one login.

Brief: [`docs/00-original-brief.md`](docs/00-original-brief.md) · Stack: [`docs/01-architecture.md`](docs/01-architecture.md) · Schema & ER: [`docs/02-database-schema.md`](docs/02-database-schema.md) · Screens: [`docs/03-screens-by-role.md`](docs/03-screens-by-role.md)

## Status

| Phase | | |
|---|---|---|
| 0 | Design approval: schema, screens, invoice mock-up | ✅ approved |
| 1 | Foundation: schema, auth, roles & permissions, settings, branding | ✅ done |
| 2 | Masters: products & lens powers, suppliers, customers, price lists, customer prices | ✅ done |
| 3 | Inventory + barcodes: stock ledger, USB & camera scanning, GRN | ✅ done |
| 4 | Sales: orders, proforma, Tally-style tax invoice, scan-to-invoice, payments | ✅ done |
| 5 | Purchase orders: reorder suggestions, PO PDF, receiving against a PO | ✅ done |
| **6** | **Customer portal, notifications, mobile app (customer + staff)** | ✅ **done** (see below) |
| 7 | Analytics, reports, Excel exports | next |
| 8 | Public website | planned |

### What Phase 6 delivers

**Customer portal** (`/portal`, for doctors, hospitals and clinics; sign in with mobile OTP):
- **Catalogue at their own price only** (special price → price list → default; never cost or other customers' rates). Filters: category, brand, lens type and **power**. Stock shows only as *Available*, *Limited* or *On request*, never quantities.
- **Product page with a power grid**: set a quantity against each power and add them all at once.
- **Cart and checkout**: delivery address, "for Dr. X" (hospital accounts), patient name, surgery date, note. Double-clicks and retries never create a second order.
- **My orders**: status timeline (Placed → Confirmed → Packed → Dispatched → Delivered), courier and docket number, items still to be sent, linked invoices, and "Order the same again".
- **Invoices**: tax invoices, proformas and credit notes to view or download as PDF.
- **Account**: outstanding, overdue, ageing (0–30 / 31–60 / 61–90 / 90+), statement, and a **statement PDF** for any period.
- **Profile**: registration details and addresses (kept by Kush Enterprise; the customer sends a change request, which reaches the owner and the assigned employee), and how they want to be kept informed.

**Notifications**
- In-app inbox for customers and staff (bell icon on both).
- Events: an order placed from the portal or app reaches the owner and the assigned employee. Customers are told when their order is received, confirmed, packed, dispatched (with courier and docket), delivered, put on hold or cancelled, and when an invoice is raised or a payment is received.
- External channels follow the customer's choice (phone push, SMS, WhatsApp, email) **and** the company switches in Settings → Notifications. Push uses the Expo push service. SMS uses the configured SMS provider. WhatsApp and email are logged until their provider accounts are set up (Phase 9).
- Messages go out right after the event. A job endpoint (`POST /api/jobs/notifications` with `JOB_SECRET`) can also be called by a scheduler every few minutes as a safety net.

**Mobile app** (`apps/mobile`, Expo for Android and iOS; one app, the mode depends on who signs in). See [`apps/mobile/README.md`](apps/mobile/README.md).
- **Customer mode**: home, catalogue with power search, power grid, cart and checkout, order tracking, invoice and statement PDFs to share (WhatsApp, email, print), account and profile, notifications.
- **Staff mode** (tabs follow the owner's permission ticks):
  - **Scan to look up** (product, power, batch, expiry, stock by batch, FEFO pick).
  - **Orders**: pending first, status steps, **pack & verify by scanning**, dispatch details.
  - **Scan-to-invoice** at the customer's price with live GST.
  - **Receive goods** by scanning GS1 codes, optionally against an open PO.
  - **Stock check**.
- **Camera scanning**: Code 128, QR, EAN/UPC and GS1 DataMatrix. A Bluetooth scanner works in the same field.
- **Weak signal**: the catalogue and account are cached on the phone for a week. Customer orders and staff invoices made offline are queued and sent automatically when the signal returns, without duplicates.
- **Security**: the session token is kept in the phone's secure keychain. The app sees exactly what the same login sees on the web (same server checks).

**Not in this phase**
- **Store builds and push notifications.** Publishing the Android/iOS store builds and turning on push both need your Expo (EAS) account, plus Google Play / Apple developer accounts. The steps are in `apps/mobile/README.md`.
- **SMS / WhatsApp / email.** Real delivery needs the provider accounts and DLT templates (Phase 9).

### What Phase 5 delivers

- **Purchase orders** with status Draft → Sent → Partly received → Received, plus Closed (short-closed) and Cancelled. PO numbers run per financial year (`KE/PO/2026-27/0001`).
- **PO editor**: choose the supplier, then add items by scanning a box, searching, or from **items below reorder level**.
  - Suggested quantity brings stock back to twice the reorder level, less anything already on an open PO.
  - Rates start at the **last price paid to that supplier** (otherwise the cost price) and can be changed.
  - GST is worked out the same way as on invoices: CGST + SGST if the supplier is in the company's state, otherwise IGST.
  - A draft can be edited until it is marked as sent.
- **PO PDF** in the same approved layout: our company at the top, "Deliver to" us, the supplier as vendor, terms, HSN summary, and a space for the supplier's acceptance. Drafts carry a DRAFT watermark.
- **Receiving against a PO**: on Receive goods, pick one of the supplier's open POs (or open it from the PO page).
  - The screen lists what is still due and refuses boxes that are not on the PO. "Add everything still due" fills the lines in one click.
  - Received quantities are booked to the PO lines; receiving more than is due is refused. **Any shortfall stays open on the PO.**
  - Each goods receipt shows which PO it was against, and each PO lists its receipts.
- **Short-close** a partly received PO (with a reason) when the rest won't come; **cancel** a PO that nothing was received against.
- **Shortcuts**: "Create purchase order" on the low-stock report, and "New purchase order" on each supplier.
- **Who sees what**: staff with the purchase-order permission see and set purchase rates on POs. Store staff (stock permission only) can receive against a PO but never see its rates or PDF.
- **Demo data**: a PO sent and partly received, one received in full, a draft built from reorder suggestions, and a cancelled one.

Not in this phase: emailing / WhatsApp-ing the PO to the supplier (needs the notification provider accounts, Phase 6/9). Download the PDF and send it for now.

### What Phase 4 delivers

- **Scan-to-invoice (counter screen)**: choose the customer, then scan each box.
  - Every item is added at **that customer's own price** (special price → price list → default). Only the owner can change a rate, and never above MRP.
  - Scanning a lens box's 2D code adds that exact serial; scanning the same item again adds one more. A duplicate serial, an unknown code, an expired batch or an item with no stock is refused with an error tone.
  - Stock comes from the scanned batch, or the earliest-expiring batch first (split across batches when needed). Serial-tracked lenses can also be ticked from the list of serials in stock.
  - Running totals show CGST + SGST or IGST as you scan. Saving twice by accident (or a retry on a weak network) never creates a second invoice.
- **Tax invoice PDF**: the approved Phase 0 layout, generated on the server.
  - Tax per HSN and rate (as Tally does), round-off, amount in words in lakh/crore, HSN summary, bank details and a UPI QR code for the amount due.
  - **CGST + SGST if the goods are delivered in the company's state, otherwise IGST.** The ship-to state decides, so a Gujarat hospital's branch in Karnataka is billed IGST.
  - Original / Duplicate / Triplicate copies in one PDF; download or print from the invoice screen.
  - The PDF is checked against the saved totals before it is produced.
- **Orders**: placed by staff (and by customers from Phase 6). Pending orders are listed first.
  - Flow: Placed → Confirmed → Packed → Dispatched → Delivered, plus On hold and Cancelled. Each step is recorded with who did it and when.
  - Rates are locked when the order is placed. Back-ordered quantities stay open until invoiced.
  - **Pack & verify**: scan every box into the parcel; wrong items and extra units are flagged.
  - Dispatch needs an invoice and the courier/docket details, which are also printed on the invoice.
- **Proforma invoices**: from scratch or from an order, same layout, no stock taken. Validity comes from Settings. **One click converts a proforma to a tax invoice** at the quoted rates.
- **Payments and the customer ledger**
  - Record a receipt (NEFT/RTGS, UPI, cheque, cash…) with the UTR or cheque number. Apply it to the oldest invoices automatically or to chosen invoices; anything left stays on the customer's account.
  - Paid / Part paid / Unpaid / **Overdue** status on every invoice (due date = invoice date + the customer's payment terms).
  - Outstanding list with ageing (0–30, 31–60, 61–90, 90+ days) and credit-limit warnings.
  - Account statement per customer: opening balance, invoices, receipts, credit notes, running balance.
- **Credit notes (sales returns)** against an invoice, at the original rates and GST, with the returned serials checked. Goods go back into stock, or are written off.
- **Cancelling an invoice** is owner-only and needs a reason. The invoice is kept (with a CANCELLED watermark), and stock and serials go back. An invoice with payments or credit notes can't be cancelled.
- **Demo sales data**: 9 invoices (one cancelled, two inter-state, back-dated so ageing shows), orders in every status, a proforma, 4 receipts (full, part, advance) and a credit note.

Not in this phase: sending documents and payment reminders by WhatsApp/email/SMS (needs the notification provider accounts, Phase 6/9), and the customer's own statement PDF (portal, Phase 6).

### What Phase 3 delivers

- **No barcode stickers.** At the owner's request, items are scanned by the barcode the manufacturer printed on the box, so there is no label printing.
  - Each item's barcode is linked once. A GS1 or EAN code is stored as the item's GTIN; any other maker's code is saved as a linked code.
  - Barcodes can be linked from the variant editor, or by scanning an unknown box on the Scan or Receive screen.
  - Every goods receipt lists any items that still have no barcode linked.
- **Scanning** works with USB/Bluetooth scanners (the scan field keeps focus) and with the camera on phones and tablets.
  - The camera uses the browser's built-in detector where available (Chrome on Android), otherwise ZXing.
  - GS1 DataMatrix / GS1-128 codes are read for GTIN (01), batch (10), expiry (17, where day 00 means end of month) and serial (21), including the `]d2` prefix and different GS separator characters.
  - Plain EAN/UPC codes, linked maker's codes and serial numbers can also be scanned.
  - A beep or vibration confirms each scan; a different tone warns of an unknown code, an expired batch, no stock, or a serial that isn't in stock.
  - Lookups take a few milliseconds (the 300 ms target is checked in the tests).
- **Goods receipt (GRN) and opening stock**
  - Scanning a box fills in the batch, expiry and serial. Scanning the same batch again adds a unit and its serial; a duplicate serial is caught.
  - Expired goods are refused.
  - Batch, expiry and serial rules follow each product's tracking switches.
  - Purchase rates are only taken from users who may see costs.
  - GRN numbers run per financial year.
- **Stock ledger**: an append-only record of every movement. Each movement updates the stock balance atomically, and **stock can never go negative** (the whole transaction rolls back if it would).
  - Each serial unit is tracked from receipt to sale or return.
  - Ledger per item: opening balance, purchases, sales, returns, adjustments, running balance and closing balance, with date filters.
- **Status badges** (In stock / Low / Out / Expiring soon) on every item, with a reorder level for each variant, product or the settings default.
  - Lens powers that were never stocked don't raise false "out of stock" alerts.
- **FEFO**: the earliest-expiring unexpired batch is suggested for picking; expired batches are never suggested.
- **Reports**
  - Expiring within 30/60/90 days, plus already expired. Values are shown to cost viewers only.
  - Low stock, with the usual supplier.
  - **Stock valuation at cost (owner only)**.
- **Adjustments** require a reason (damaged, expired, sample, correction, lost). Removing serial-tracked units means choosing which serials.
- **Returns to supplier** get a debit-note number, and the returned serials are marked accordingly.
- **Locations**: a default "Main store", with stock tracked by location.
- **Demo stock**: an opening-stock entry with 76 lines and 638 units, including one batch expiring soon and one already expired.

### What Phase 2 delivers

- **Products** (anyone on staff can view; editing needs *Manage products*)
  - Product master: code/SKU, category, brand/manufacturer, model, HSN, GST rate and unit (both taken from Settings), default rate, MRP, purchase cost, reorder level, description and images.
  - Lens attributes: lens type (monofocal / toric / multifocal / EDOF), material, A-constant, optic size, overall length, preloaded.
  - Batch, expiry and serial tracking switches for each product. Batches and serials are recorded at goods receipt in Phase 3.
  - The selling rate can never be above MRP.
- **Power variants**
  - A generator that creates every power in a range (e.g. +10.00 to +30.00 D in 0.50 steps), multiplied by cylinders for torics or by add powers for multifocals. Existing powers are skipped.
  - Each variant gets its own SKU (`CODE-+21.50`) and its own Code 128 barcode (`KE00000123`).
  - The manufacturer's GTIN/EAN can be recorded; its check digit is validated and it is stored as 14 digits so box scans match.
  - The product list filters by power.
- **Cost is hidden** from anyone without *View prices / margins*. The API leaves it out of every response, not just the screen. Changing a cost needs that permission too.
- **Suppliers**: codes (`SUP-001`), GSTIN checked against the state, payment terms, and the products each supplier provides with supplier SKU and last purchase rate. Purchase rates are shown only to PO creators and cost viewers.
- **Customers** (Doctor / Hospital / Clinic; needs *Manage customers*)
  - Code (`CUST-0001`), GSTIN (optional) checked against the state, with the PAN filled in from it, drug licence, credit limit, payment terms and assigned employee.
  - Several billing and shipping addresses, each kind with one default.
  - Doctors linked under a hospital or clinic.
  - App/portal logins: one-time code to the customer's mobile, a "send sign-in SMS" button, and deactivating the customer disables its logins.
- **Pricing**: special price → price list → default rate. Viewing needs *View prices / margins*; changing prices is owner-only.
  - Price lists, each assigned to many customers.
  - Special prices for each customer, with optional valid-from / valid-to dates. Outside those dates the next level applies.
  - **Pricing workbench**: pick a customer and see, for every product, the default, list, special and effective rate, the difference and the margin. Prices can be edited in place.
  - **Bulk edit**: % off default, one fixed rate, or clear.
  - **Excel export/import** with a review screen before anything is saved.
  - **Price history**: every change to the default rate, MRP, cost, list or special price, with who made it and when. Invoices will store the rate actually charged, so old invoices never change.
- **Demo data** for trying the system (`pnpm db:seed:demo`, refused in production). All names are fictional.
  - 3 suppliers.
  - 30 products: 8 IOL models with 223 power variants, plus instruments, consumables and equipment.
  - 10 customers: 3 hospitals, 3 clinics and 4 doctors, 2 of whom are linked to hospitals.
  - 2 price lists and some special prices, including one that has expired.
  - 2 demo staff logins and one customer login.

### What Phase 1 delivers

- **Database**: the full approved schema (45 tables) as a Prisma migration. The seed loads the 37 GST state codes, company settings with placeholders, document number series for the current financial year, the 4 product categories, a default stock location and the first owner account.
- **Sign-in**
  - Email or mobile + password (argon2id). Mobile OTP with 6-digit codes that are single-use, expire after 5 minutes, allow 5 attempts, can be resent after 30 s and are limited to 5 an hour. OTP requests give the same response whether or not the number is registered.
  - 5 wrong passwords lock the account for 15 min.
  - HttpOnly session cookies for the web; bearer tokens for the future mobile app.
  - Signed-in device list with remote sign-out. Changing a password signs out the other devices.
- **Roles & permissions, enforced on the server.**
  - Owner, Employee and Customer roles. 13 permission checkboxes for each employee.
  - Every API call is checked. Permission changes apply on the employee's next request. Deactivating someone signs them out at once.
  - Cross-site POSTs are rejected.
- **Employees**: add, edit, set permissions with quick-start presets, reset the password (forces a change at next sign-in), deactivate or re-activate.
- **Settings** (owner only)
  - Company profile, with a GSTIN check-digit check and a check that the GSTIN matches the state and PAN.
  - Bank and UPI details, and the signature/stamp image upload.
  - **Document numbering** for each financial year, with a live preview. A new financial year starts its own series automatically, and numbers are allocated without gaps or duplicates, even when two are taken at the same moment.
  - Terms and declaration, default invoice copies.
  - GST rates and units, categories, reorder and expiry-alert defaults, notification channels, label sizes.
- **Activity log**: an append-only record of sign-ins, lockouts, employee and permission changes, and settings changes, with before/after values.
- **Branding**: theme in the logo colours, Inter font, favicon/app icons generated from `logo-icon.png` (clear at 16 px), stacked logo on the sign-in page, PWA manifest. Brand teal `#1A9E9A` is used for accents. Button and link text uses a slightly darker teal `#147C79`, because the brand teal on white is below the WCAG AA contrast minimum (3.3:1 against 4.5:1).
- **Placeholder screens** for later phases. They appear in the menu with a "P2–P8" tag and follow the same permission rules.

## Preview in your browser (nothing to install)

Use **GitHub Codespaces**: the app and its database run on GitHub, and you use them in your web browser.

1. Open the repository on GitHub and switch the branch selector to **`claude/awesome-ritchie-5gn9wa`**.
2. Click **Code → Codespaces → Create codespace on claude/awesome-ritchie-5gn9wa**.
3. Wait about 3–5 minutes the first time. It installs everything, creates the database and loads the demo data on its own.
4. The app builds and starts in the terminal (`pnpm preview`). When it's ready, a **Kush Enterprise** preview opens. If it doesn't, open the **Ports** tab and click the globe icon next to port 3000.
5. Sign in with the demo logins below.

When you're done, stop the codespace (**Code → Codespaces → … → Stop**) so it doesn't use your free hours. Your data is kept until you delete the codespace.

## Running locally (with demo data)

On your own computer you need **Node.js 22+**, **Docker Desktop** (for the database) and **Git**.

```bash
git clone https://github.com/shreydalal318/kushenterprise.git
```

```bash
cd kushenterprise && git checkout claude/awesome-ritchie-5gn9wa
```

```bash
corepack enable
```

```bash
docker compose up -d db
```

```bash
cp .env.example .env
```

```bash
pnpm install
```

```bash
pnpm setup:demo
```

```bash
pnpm dev
```

Open **http://localhost:3000** (or the Codespaces preview) and sign in:

| Who | Login | Password |
|---|---|---|
| Owner (everything) | `owner@example.com` | `ChangeMe!2026` |
| Counter staff (orders, billing, customers) | `ravi.counter@demo.local` | `DemoStaff2026` |
| Store staff (stock, scanning, products) | `sunita.store@demo.local` | `DemoStaff2026` |
| Customer (Mobile OTP tab) | `90000 10001` | The 6-digit code is printed in the terminal running `pnpm dev` |

`pnpm setup:demo` creates the database tables and loads the demo data: 3 suppliers, 30 products with 223 lens powers, 10 customers, 2 price lists, special prices, 638 units of opening stock, demo sales (orders, invoices, payments, a credit note) and demo purchase orders. Running it again does no harm.

The demo sets the company state to Gujarat so GST can be worked out. Enter the real company profile in **Settings → Company**.

**Invoice PDFs** are produced with Chromium. Codespaces installs it for you. Elsewhere, install it once with `pnpm --filter @kush/web exec playwright install chromium`, or point `CHROMIUM_PATH` at an installed Chrome/Chromium.

- **No Docker?** Install PostgreSQL 16, create a user `kush` (password `kush`) and a database `kush`, or edit `DATABASE_URL` in `.env`.
- **Windows:** use `copy .env.example .env` instead of `cp`.
- **USB barcode scanner:** plug it in and scan into the Scan or Receive screen.
- **Camera scanning** needs `https://` or `localhost`.

### Tests

```bash
pnpm typecheck
```

```bash
pnpm test                   # unit (core) + API integration tests against TEST_DATABASE_URL
```

```bash
pnpm --filter @kush/web build && pnpm test:e2e   # browser tests (Playwright) against the built app
```

The tests use `TEST_DATABASE_URL`. They apply migrations without wiping anything and create uniquely named data, so they can be re-run against the same database. CI (`.github/workflows/ci.yml`) runs all of the above on every push.

## Repository layout

```
apps/web            Next.js 16: public site, staff app (/app), customer portal (/portal), API (/api/trpc)
packages/api        tRPC routers, auth (password, OTP, sessions), permission middleware, services
packages/core       Pure TypeScript: money/words (lakh-crore), dates & financial year, GST, permissions, validators
packages/db         Prisma schema, migrations, seed
apps/mobile         Expo app (Android + iOS): customer mode and staff mode
packages/pdf        Invoice / proforma / credit-note / PO / statement PDFs (HTML templates from the Phase 0 mock-up → Chromium)
design/             Phase 0 invoice mock-up generator (the approved layout used by packages/pdf)
brand/              Logo files supplied with the brief (source/) + whitespace-trimmed copies
docs/               Brief, architecture, schema/ER, screens per role
```
