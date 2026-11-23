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
| **3** | **Inventory + barcodes: stock ledger, USB & camera scanning, GRN** | ✅ **done** (see below) |
| 4 | Sales: orders, proforma, Tally-style tax invoice, scan-to-invoice, payments | next |
| 5–8 | POs → Portal & mobile → Analytics → Website | planned |

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

## Running locally (with demo data)

You need **Node.js 22+**, **Docker Desktop** (for the database) and **Git**.

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

Open **http://localhost:3000** and sign in:

| Who | Login | Password |
|---|---|---|
| Owner (everything) | `owner@example.com` | `ChangeMe!2026` |
| Counter staff (orders, billing, customers) | `ravi.counter@demo.local` | `DemoStaff2026` |
| Store staff (stock, scanning, products) | `sunita.store@demo.local` | `DemoStaff2026` |
| Customer (Mobile OTP tab) | `90000 10001` | The 6-digit code is printed in the terminal running `pnpm dev` |

`pnpm setup:demo` creates the database tables and loads the demo data: 3 suppliers, 30 products with 223 lens powers, 10 customers, 2 price lists, special prices, and 638 units of opening stock. Running it again does no harm.

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
design/             Phase 0 invoice mock-up generator (becomes the PDF package in Phase 4)
brand/              Logo files supplied with the brief (source/) + whitespace-trimmed copies
docs/               Brief, architecture, schema/ER, screens per role
```
