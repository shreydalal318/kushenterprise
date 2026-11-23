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
| **1** | **Foundation: schema, auth, roles & permissions, settings, branding** | ✅ **done** (see below) |
| 2 | Masters: products & lens powers, suppliers, customers, price lists, customer prices | next |
| 3–8 | Inventory & barcodes → Sales & invoices → POs → Portal & mobile → Analytics → Website | planned |

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

## Running locally

Requirements: Node 22+, pnpm 10, PostgreSQL 16 (`docker compose up -d db` starts one).

```bash
cp .env.example .env        # then set SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD
```

```bash
pnpm install
```

```bash
pnpm db:deploy && pnpm db:seed
```

```bash
pnpm dev                    # http://localhost:3000, sign in with the seeded owner
```

In development, OTP codes are printed to the server log (`SMS_PROVIDER=console`). Real SMS/WhatsApp providers are connected in Phase 6.

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
