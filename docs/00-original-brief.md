# Build Prompt — Kush Enterprise: Website + Inventory, Ordering & Billing App

## 1. About the business

Kush Enterprise supplies **ophthalmic lenses (intraocular lenses / IOLs) and medical instruments** to **hospitals, clinics and doctors** in India. Build them **one system** with three parts:

1. **Public website**: company profile, product catalogue, enquiry form, and customer login.
2. **Web app (admin + staff)**: inventory, barcode scanning, orders, proforma invoices, Tally-style tax invoices, purchase orders, customer accounts, customer-specific pricing, employees and sales analytics.
3. **Mobile app (Android + iOS)** has two modes on one login:
   - **Customer mode** (doctor / hospital / clinic): browse products at *their* prices, place orders, track order status, download invoices.
   - **Staff mode**: scan barcodes with the phone camera, check stock, update order status, create invoices on the go.

All three share one backend and one database, so a change in one place shows up everywhere straight away.

**Suggested stack** (you can propose a better one, but explain why): Next.js (website + web app), React Native / Expo (mobile app), Node/NestJS or Next.js API routes, PostgreSQL with Prisma, server-side PDF generation (e.g. Puppeteer/Playwright HTML→PDF), and S3-compatible storage for PDFs and images. Everything must be responsive and work well on a tablet at the counter.

---

## 2. User roles and permissions

| Role | Who | Can do |
|---|---|---|
| **Owner / Admin** | Kush Enterprise owner | Everything: settings, pricing, analytics, employees, invoices, purchase orders, delete or cancel |
| **Employee** | Staff added by the owner | Only what the owner allows (see below) |
| **Customer** | Doctor, Hospital or Clinic account | Own catalogue at own prices, place orders, see own orders, status, invoices and outstanding balance |

**Employee permissions** are set by the owner using checkboxes for each employee:
view orders · update order status · create orders for customers · create proforma · create tax invoice · manage stock / GRN · scan & dispatch · create purchase orders · manage customers · **view prices / margins** · view analytics.
Keep an **activity log** of who did what and when (status changes, invoice created, stock adjusted, price changed).

---

## 3. Customer accounts (Doctors / Hospitals / Clinics)

- The owner or a permitted employee **creates the account directly**. Account type is one of Doctor, Hospital or Clinic.
- Fields: name, type, contact person, mobile, email, billing address, shipping address(es), **state** (drives CGST+SGST vs IGST), **GSTIN** (optional for individual doctors), PAN, drug licence no. (optional), credit limit, payment terms (days), assigned employee, notes.
- A hospital can have **linked doctors** under it. An order can be placed "for Dr. X at Hospital Y".
- Login credentials are sent by SMS / WhatsApp / email, with OTP login on mobile.
- Each customer has a **ledger**: invoices, payments received and outstanding balance with ageing (0–30, 31–60, 61–90, 90+ days).

---

## 4. Customer-specific pricing (important)

Different doctors and hospitals pay **different prices for the same item**.

- Every product has a **default selling rate** and an MRP.
- **Price lists** (e.g. "Govt hospitals", "Private clinics – Tier A") can be assigned to many customers.
- **Customer-specific price overrides** can be set per product per customer, and these win over everything else.
- Price precedence: **Customer override → Customer's price list → Default rate**.
- An optional **valid-from / valid-to date** on special prices.
- A customer only ever sees **their own price**. They never see other customers' prices or the purchase cost.
- Pricing screen: pick a customer and see every product with default rate, their rate and difference. Allow bulk edit and Excel import/export.
- Keep a **price history** so old invoices always keep the price used at the time.

---

## 5. Products and inventory

**Product master**
- Category (IOL / Lens, Surgical Instrument, Consumable, Equipment, …), brand / manufacturer, model, product code / SKU, HSN code, GST rate, unit (pcs / box), purchase cost, default rate, MRP, images, description.
- **Lens-specific attributes:** lens type (monofocal / toric / multifocal / EDOF), material, **power (diopter)**, cylinder (for toric), A-constant, optic size and overall length. Customers must be able to **filter by power**.
- Variants: one lens model can have many powers, each with its own stock.

**Batch, serial and expiry tracking**
- Every stock entry records **batch / lot number, serial number (if any) and expiry date**.
- **FEFO** (first-expiry-first-out) is suggested automatically when picking.
- Alerts for stock **expiring in 30 / 60 / 90 days**.

**Stock status**
- Shown on every product as **In stock · Low stock · Out of stock · Expiring soon**, with colour badges.
- Reorder level per product, plus a low-stock alert list.
- Stock ledger per item: opening balance, purchases (GRN), sales, returns, adjustments, closing balance.
- Stock adjustment with a required reason (damaged, expired, sample, correction).
- Stock valuation report (at cost) for the owner only.
- Sales returns and returns to supplier update stock automatically.

---

## 6. Barcodes and scanning

- **Generate a barcode** (Code 128) and **QR code** for each product/variant, and a batch-level label that carries batch + expiry.
- **Print labels** on thermal label printers (e.g. 50×25 mm and 38×25 mm) and on A4 sticker sheets. Labels show product name, power, batch, expiry, MRP and barcode.
- **Use manufacturers' existing barcodes too.** Many lens boxes already carry a GS1 barcode or DataMatrix. Parse GTIN, batch (10), expiry (17) and serial (21) when scanned, and let staff map an unknown barcode to a product once.
- **Scanning works with:**
  - USB / Bluetooth barcode scanners on the web app (keyboard-wedge input; the invoice screen keeps focus on a scan field).
  - The phone camera in the mobile app.
- **Scan to invoice:** each scan adds the item to the bill at **that customer's price**, picks the scanned batch, and increases the quantity if it is scanned again. A beep or vibration confirms each scan, and an error sound plays for an unknown, expired or out-of-stock item.
- **Scan to receive stock** (GRN against a purchase order), **scan to dispatch** (check that the packed items match the order), and **scan to look up** (stock, batch, expiry, location).

---

## 7. Orders

- Customers place orders from the website portal or mobile app: search or filter (category, brand, **power**), add to cart, choose a delivery address, add a note or patient/surgery date (optional), and submit.
- Staff can also **create orders on behalf of a customer** (phone or WhatsApp orders).
- **Order status flow:** Placed → Confirmed → Packed → Dispatched → Delivered, with Cancelled / On hold as side states. Each change is timestamped with who made it.
- The customer sees a **live status timeline** and gets a notification (in-app, plus optional WhatsApp/SMS/email) on every status change.
- Dispatch details: courier/transporter name, docket/LR no., vehicle no., dispatch date.
- Order list for staff: filters by status, customer, date and assigned employee. Pending orders appear at the top.
- One click to convert an order into a **Proforma Invoice** or **Tax Invoice**. Partial dispatch is allowed and back-orders are tracked.

---

## 8. Proforma invoice

- Created from an order or from scratch, using customer pricing.
- PDF in the same visual style as the tax invoice, titled **"PROFORMA INVOICE"**, with validity date and terms.
- Can be shared by WhatsApp or email, or downloaded.
- One click to convert it into a Tax Invoice without re-entering anything.
- Separate numbering, e.g. `KE/PI/2026-27/0001`.

---

## 9. Tax invoice: Tally-style layout (must match closely)

Generate an **A4 PDF that looks like a Tally Prime GST invoice**: a boxed and bordered grid layout with thin black lines and compact fonts.

**Header block**
- **Kush Enterprise primary logo** at top-left, with company name, address, phone, email, **GSTIN/UIN, State name & code**, PAN and drug licence no.
- Title **"TAX INVOICE"** centred at top, with a copy label at top-right: *Original for Recipient / Duplicate for Transporter / Triplicate for Supplier*. Let the user choose which copies to print.

**Right-side info grid**
Invoice No. · Dated · Delivery Note · Mode/Terms of Payment · Reference No. & Date · Other References · Buyer's Order No. · Dated · Dispatch Doc No. · Delivery Note Date · Dispatched through · Destination · Terms of Delivery.

**Party blocks**
- **Consignee (Ship to)**: name, address, GSTIN, State & code.
- **Buyer (Bill to)**: name, address, GSTIN, State & code.

**Item table columns**
Sl No. · Description of Goods · HSN/SAC · Quantity · Rate · per · Disc. % · Amount
- Under each item description, in smaller text: **Batch, Expiry, Power, Serial no.**
- Tax lines below the items: **CGST + SGST** for intra-state, or **IGST** for inter-state (decided automatically from the buyer's state), then **Round Off** and **Total** (quantity total and amount total).

**Footer**
- **"Amount Chargeable (in words)": "INR … Only"**, using Indian numbering (lakh/crore).
- **HSN-wise tax summary table:** HSN/SAC · Taxable Value · Central Tax (Rate, Amount) · State Tax (Rate, Amount) · Total Tax Amount (or IGST columns), with a total row.
- "Tax Amount (in words)".
- Company's bank details (bank name, A/c no., IFSC, branch) and an optional UPI QR code for payment.
- Declaration text (editable in settings).
- **"for Kush Enterprise"** with signature/stamp image and **"Authorised Signatory"**.
- "This is a Computer Generated Invoice". Use the small horizontal logo lockup in the page footer.
- Multi-page invoices repeat the header and show "continued…" with page numbers.

**Rules**
- Invoice numbering runs per **financial year (April–March)**, e.g. `KE/2026-27/0001`, and the prefix can be configured.
- Invoices are **never deleted**, only **cancelled**, with a reason (kept for audit).
- Credit notes are used for returns.
- Sales register and GST reports (B2B / B2C summary, HSN summary) can be exported to Excel for the accountant.
- *Phase 2:* **Export vouchers to Tally** (Tally XML import), plus e-invoice (IRN/QR) and e-way bill readiness.

---

## 10. Purchase orders (to supplier companies)

- **Supplier master**: company name, address, GSTIN, state, contact, payment terms, and the products they supply with last purchase rate.
- Create a PO by picking a supplier and adding items (quantity, rate, GST, expected delivery date). The system can **auto-suggest items that are below their reorder level**.
- Generate **one clean PDF per PO** in the same branding and boxed style: logo, "PURCHASE ORDER", PO no. & date, supplier block, ship-to (Kush Enterprise), item table (Sl, Description, HSN, Qty, Unit, Rate, GST %, Amount), tax totals, grand total in words, terms & conditions, and authorised signatory.
- Send the PO by email/WhatsApp, or download it.
- PO status: Draft → Sent → Partially received → Received → Closed / Cancelled.
- **Receive goods (GRN) against the PO** by scanning, with entry of batch, expiry and serial. Stock updates automatically and any shortfall stays open on the PO.
- Numbering: `KE/PO/2026-27/0001`.

---

## 11. Owner dashboard and sales analytics

Visible only to the owner (or employees given the analytics permission):
- Today / this week / this month: sales, number of orders, invoices raised, payments received, outstanding.
- Sales trend chart (daily / monthly) with a comparison to the previous period.
- **Top products, top customers (doctors/hospitals), sales by category and brand, sales by employee.**
- Gross margin by product and customer (cost vs selling price).
- Stock summary: stock value, low-stock count, out-of-stock count, **expiring-soon value**.
- Outstanding receivables with ageing, and the top overdue customers.
- Pending orders by status.
- Every report has date filters and can be exported to Excel/PDF.

---

## 12. Public website

- Pages: Home, About, Products (catalogue by category and brand, with **no prices shown publicly**; show "Login to see your price" instead), Contact / Enquiry form (saved as leads in the admin), and Customer Login.
- Clean, professional, medical-trustworthy look. Fast and SEO-friendly.

---

## 13. Branding (use ONLY this logo set: the two overlapping circles)

Logo files are supplied with this prompt:

| File | Use for |
|---|---|
| `logo-primary-lockup.png` | Website header, invoice / proforma / PO header, letterhead |
| `logo-stacked.png` | Login screen, mobile app splash screen |
| `logo-icon.png` | Mobile app icon, favicon, loading spinner, PWA icon (must stay clear at 64 / 32 / 16 px) |
| `logo-usage-sizes.png` | Reference sheet: small horizontal lockup for invoice footer / email signature, and minimum sizes |

**Colours (taken from the logo)**
- Navy (primary): `#1B3A5C`
- Teal (accent / buttons / links): `#1A9E9A`
- Light aqua (highlights, selected rows, badges background): `#A9DDDA`
- Text / dark: `#1F2933`
- White backgrounds. Use soft greys for borders.

**Typography:** a clean geometric sans-serif similar to the wordmark (e.g. Manrope or Inter).
Do not stretch, recolour or redraw the logo. The PDFs (invoice, proforma, PO) must use the same logo and colours, but keep the invoice body black-on-white like Tally so it prints and photocopies cleanly.

---

## 14. Settings (owner)

Company profile (name, address, GSTIN, PAN, state, drug licence, phone, email, bank details, UPI ID, signature/stamp image), invoice/PO/proforma number prefixes and starting numbers, financial year, default terms & declaration text, GST rates, units, categories, reorder defaults, expiry alert days, notification channels (WhatsApp/SMS/email API keys), and label printer sizes.

Use placeholders until real details are given: `[Company Address]`, `[GSTIN]`, `[PAN]`, `[State & Code]`, `[Bank Name / A/c No / IFSC]`, `[Drug Licence No]`.

---

## 15. Non-functional requirements

- Secure login (hashed passwords, OTP on mobile), role-based access enforced **on the server**, not just hidden in the UI.
- Full audit trail on invoices, prices, stock and status changes.
- Daily automatic database backups.
- All amounts in **₹ (INR)** with Indian number formatting (1,00,000.00), dates in DD-MM-YYYY, and Asia/Kolkata timezone.
- Fast scanning: adding a scanned item to the bill should feel instant (< 300 ms).
- The mobile app should cache the catalogue and allow scanning even on weak internet, then sync.
- Seed the system with demo data: 3 suppliers, 30 products (lenses in several powers + instruments), 10 customers (mix of doctors, hospitals and clinics) with different prices, sample orders in every status, invoices, and one PO.

---

## 16. Build order (deliver in phases and show me each one)

1. **Foundation:** database schema, auth, roles & permissions, settings, branding/theme.
2. **Masters:** products (with lens attributes, batches, expiry), suppliers, customers, price lists and customer-specific prices.
3. **Inventory + barcodes:** stock ledger, status badges, label generation & printing, scanning (USB + camera), GRN.
4. **Sales:** orders + status flow, proforma, **Tally-style tax invoice PDF**, scan-to-invoice, payments & customer ledger.
5. **Purchase orders:** PO creation, PDF, receive against PO.
6. **Customer portal + mobile app:** catalogue at own price, ordering, order tracking, invoice download, notifications.
7. **Owner analytics dashboard + reports + Excel exports.**
8. **Public website.**
9. Phase 2: Tally XML export, e-invoice/e-way bill, WhatsApp automation.

Before writing code, give me: (a) the database schema / ER diagram, (b) the list of screens for each role, and (c) a mock-up of the tax invoice PDF using sample data, so I can approve the Tally layout first.
