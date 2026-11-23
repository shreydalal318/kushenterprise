# Kush Enterprise: Website + Inventory, Ordering & Billing

One system for Kush Enterprise, a supplier of ophthalmic lenses (IOLs) and medical instruments to hospitals, clinics and doctors. It has three parts:

1. **Public website**: company profile, catalogue (no public prices), enquiry form, customer login.
2. **Web app (owner + staff)**: inventory, barcode scanning, orders, proforma, Tally-style GST invoices, purchase orders, customer pricing, employees, analytics.
3. **Mobile app (Android + iOS)**: customer mode (order at own prices, track, download invoices) and staff mode (camera scanning, stock, dispatch, invoicing).

The full brief is in [`docs/00-original-brief.md`](docs/00-original-brief.md).

## Status: Phase 0, design for approval

The brief asks for three items to approve before any app code is written:

| | Deliverable | Where |
|---|---|---|
| **(a)** | Database schema + ER diagrams | [`docs/02-database-schema.md`](docs/02-database-schema.md) · [`design/schema/schema.prisma`](design/schema/schema.prisma) (45 models, passes `prisma validate`) |
| **(b)** | Screens for each role | [`docs/03-screens-by-role.md`](docs/03-screens-by-role.md) (54 screens) |
| **(c)** | Tally-style tax invoice mock-up | [`design/invoice-mockup/out/`](design/invoice-mockup/out/): PDFs and PNG previews |
| | Stack proposal and reasons | [`docs/01-architecture.md`](docs/01-architecture.md) |

### Invoice mock-ups

- `sample-1-tax-invoice-intra-state.pdf`: one page, **CGST + SGST**, 7 lines covering monofocal, toric and trifocal IOLs, OVD and instruments, with batch, expiry, power and serials under each description.
- `sample-2-tax-invoice-inter-state-multipage.pdf`: **IGST**, 20 lines that run onto a second page. The full header repeats, page 1 ends with "continued to page 2 …", and pages are numbered "Page x of y".

To regenerate (the totals, tax and amounts in words are calculated, not typed in):

```bash
cd design/invoice-mockup && npm install && npm run build
# copies: node generate.mjs --copies original,duplicate,triplicate
```

## Branding

The logos supplied with the brief are in [`brand/source/`](brand/source/). The `brand/*-trim.png` files are the same artwork with the empty margin cropped off (not stretched, recoloured or redrawn), for tight placements such as the invoice header and footer.

Colours: Navy `#1B3A5C` · Teal `#1A9E9A` · Light aqua `#A9DDDA` · Text `#1F2933`. Font: Inter.

## Build phases

1. Foundation: schema, auth, roles and permissions, settings, theme ← *next, after approval*
2. Masters: products and lens variants, suppliers, customers, price lists, customer prices
3. Inventory + barcodes: stock ledger, badges, labels, USB and camera scanning, GRN
4. Sales: orders and status flow, proforma, tax invoice PDF, scan-to-invoice, payments and ledger
5. Purchase orders: PO, PDF, receive against PO
6. Customer portal + mobile app
7. Owner analytics, reports, Excel exports
8. Public website
9. Phase 2: Tally XML, e-invoice / e-way bill, WhatsApp automation
