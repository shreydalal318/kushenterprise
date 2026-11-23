# (b) Screens by role

Every staff screen below is gated by the permissions in brackets, and the API enforces the same check. An employee without a permission does not see the menu item, and the API returns 403 if they call it anyway. The **Owner** has every permission.

Legend: 🌐 public website · 🖥 web app (desktop / counter tablet) · 📱 mobile app

---

## Public (not logged in) 🌐

| # | Screen | What's on it |
|---|---|---|
| P1 | **Home** | Hero section with the primary logo, what we supply (IOLs, instruments, consumables), featured brands, trust points (genuine stock, batch traceability, fast dispatch), enquiry call-to-action |
| P2 | **About** | Company profile, service areas, licences (drug licence no., GSTIN) |
| P3 | **Products: catalogue** | Browse by category and brand, with search and filters (category, brand, lens type, **power range**). **No prices**: each product shows "Login to see your price" |
| P4 | **Product detail** | Images, description, lens attributes (type, material, A-constant, optic size, overall length, available powers), "Enquire" and "Login to order" buttons |
| P5 | **Contact / Enquiry** | Enquiry form (saved as a **Lead** in admin), map, phone, WhatsApp link |
| P6 | **Customer login** | Mobile + OTP, or email + password. Uses the stacked logo |

---

## Customer: Doctor / Hospital / Clinic 🌐 portal + 📱 customer mode

| # | Screen | What's on it |
|---|---|---|
| C1 | **Login / OTP** | Stacked logo, mobile number, OTP. 📱 splash screen uses the stacked logo |
| C2 | **Home** | Recent orders with live status, outstanding balance, quick re-order, notifications |
| C3 | **Catalogue** | Products at **their own price only**. Filter by category, brand, lens type and **power (dioptre)**. Stock badge shown as Available / Limited / On request (no exact quantities) |
| C4 | **Product detail + power grid** | Pick powers from a grid (e.g. +10.0 to +30.0 D) and set the quantity for each power |
| C5 | **Cart & checkout** | Delivery address, "for Dr. X" (hospital accounts), patient name / surgery date (optional), note, submit |
| C6 | **My orders** | List with status filters |
| C7 | **Order detail** | **Status timeline** (Placed → Confirmed → Packed → Dispatched → Delivered), dispatch details (courier, docket no.), back-ordered items, linked invoices |
| C8 | **Invoices** | List of invoices and proformas, with PDF download and share |
| C9 | **Account / ledger** | Invoices, payments, outstanding, ageing (0–30 / 31–60 / 61–90 / 90+), statement PDF |
| C10 | **Notifications** | In-app inbox. Push, WhatsApp, SMS or email according to the customer's preferences |
| C11 | **Profile** | Addresses (read-only or request a change), linked doctors (hospital accounts), contact details |

---

## Staff (Employee) 🖥 web app + 📱 staff mode

The menu shows only what the owner has ticked for that employee.

### Dashboard & orders
| # | Screen | Permission | What's on it |
|---|---|---|---|
| S1 | **Staff home** | any | My assigned orders, pending dispatches, low-stock and expiring alerts (alert counts only, no values unless allowed) |
| S2 | **Order list** | VIEW_ORDERS | Filters: status, customer, date, assigned employee. **Pending orders first** |
| S3 | **Order detail** | VIEW_ORDERS | Lines with back-order quantities, timeline, actions: **Confirm / Pack / Dispatch / Deliver / Hold / Cancel** (UPDATE_ORDER_STATUS), convert to Proforma or Invoice |
| S4 | **New order for customer** | CREATE_ORDERS | Pick a customer (prices resolve automatically), add items by search or scan, address, notes |
| S5 | **Scan to dispatch** | SCAN_DISPATCH | Scan the packed items against the order; any mismatch or missing item is flagged. Enter courier, docket/LR no., vehicle no. |

### Billing
| # | Screen | Permission | What's on it |
|---|---|---|---|
| S6 | **Proforma list / editor** | CREATE_PROFORMA | Create from an order or from scratch, set validity and terms, PDF preview, share by WhatsApp or email, **Convert to tax invoice** |
| S7 | **Scan-to-invoice (counter screen)** | CREATE_TAX_INVOICE | Large scan field that always keeps focus. Each scan adds the item at **the customer's price** with the scanned batch, and a repeat scan adds +1. Beep on success, error tone if the item is unknown, expired or out of stock. FEFO suggestion. Running totals, CGST/SGST or IGST split |
| S8 | **Invoice list / detail** | CREATE_TAX_INVOICE | Search and filter. Print (choose copies: Original / Duplicate / Triplicate), share, credit note. **Cancel with reason** (owner only by default) |
| S9 | **Payments** | RECORD_PAYMENTS | Record a receipt (mode, UTR or cheque no.) and allocate it to invoices |
| S10 | **Customer ledger** | RECORD_PAYMENTS or MANAGE_CUSTOMERS | Statement, ageing, send a reminder |
| S11 | **Credit note / sales return** | CREATE_TAX_INVOICE | Against an invoice. Restock or write off |

### Inventory & barcodes
| # | Screen | Permission | What's on it |
|---|---|---|---|
| S12 | **Stock overview** | any staff | Per product and variant: badge (**In stock / Low / Out / Expiring soon**), quantity, batches. Cost hidden unless VIEW_PRICES_MARGINS |
| S13 | **Scan to look up** 📱🖥 | any staff | Scan → product, power, stock by batch and location, expiry. Map an unknown barcode to a product (MANAGE_PRODUCTS) |
| S14 | **Stock ledger** | MANAGE_STOCK | Opening → GRN → sales → returns → adjustments → closing, per item |
| S15 | **Stock adjustment** | MANAGE_STOCK | Quantity ±, **reason required** (damaged / expired / sample / correction / lost) |
| S16 | **Expiry report** | MANAGE_STOCK | Expiring in 30 / 60 / 90 days, with value shown only if VIEW_PRICES_MARGINS |
| S17 | **Low-stock list** | MANAGE_STOCK | Items below reorder level, with a "Create PO" shortcut |
| S18 | ~~Label printing~~ | n/a | **Dropped at the owner's request (Phase 3):** no stickers are printed. Items are scanned by the manufacturer's barcode, linked to the product once (variant editor or the Scan screen) |
| S19 | **GRN: receive goods** 📱🖥 | MANAGE_STOCK | Against a PO or standalone. Scanning parses GS1 (GTIN, batch, expiry, serial). Enter batch, expiry and serials. Shortfall stays open on the PO |
| S20 | **Return to supplier** | MANAGE_STOCK | Choose batches and serials, reason, debit note |

### Purchasing
| # | Screen | Permission | What's on it |
|---|---|---|---|
| S21 | **PO list** | CREATE_PURCHASE_ORDERS | Status: Draft / Sent / Partially received / Received / Closed / Cancelled |
| S22 | **PO editor** | CREATE_PURCHASE_ORDERS | Supplier, **auto-suggest below-reorder items**, last purchase rate, GST, expected date, terms. PDF preview, send by email or WhatsApp |
| S23 | **Suppliers** | CREATE_PURCHASE_ORDERS | Supplier master and the products each one supplies |

### Masters
| # | Screen | Permission | What's on it |
|---|---|---|---|
| S24 | **Customers list / editor** | MANAGE_CUSTOMERS | Type, GSTIN, state, PAN, drug licence, credit limit, terms, addresses, linked doctors, assigned employee, price list. **Send login** by SMS, WhatsApp or email |
| S25 | **Products list / editor** | MANAGE_PRODUCTS | Product master, lens attributes, **power-variant generator** (e.g. +10.0 to +30.0 in 0.5 D steps), images, barcodes, GTIN |
| S26 | **Leads** | MANAGE_CUSTOMERS | Website enquiries, status, convert to customer |

### Mobile staff mode 📱 (subset, built for one hand)
Scan to look up (S13) · Scan-to-invoice (S7) · Scan to dispatch (S5) · GRN scan (S19) · Order list and status update (S2/S3) · Stock check (S12). Camera scanning reads Code 128, QR, EAN and GS1 DataMatrix. Scans are queued offline and synced when the connection returns.

---

## Owner (everything above, plus) 🖥 (and 📱 dashboard view)

| # | Screen | What's on it |
|---|---|---|
| O1 | **Owner dashboard** | Today / week / month: sales, orders, invoices raised, payments received, outstanding. Sales trend against the previous period. Pending orders by status. Stock value, low and out-of-stock counts, **expiring-soon value**. Receivables ageing and top overdue customers |
| O2 | **Sales analytics** | Top products, top customers, sales by category, brand and employee. Date filters, Excel/PDF export |
| O3 | **Margin analytics** | Gross margin by product and by customer (cost vs selling price) |
| O4 | **Pricing workbench** | Pick a customer → every product with **default rate / their rate / difference**. Bulk edit (set %, set fixed), validity dates, **Excel import/export**, price history |
| O5 | **Price lists** | Create lists, assign to customers, edit rates |
| O6 | **Reports** | Sales register, **GST: B2B / B2C summary, HSN summary**, stock valuation (at cost), stock ledger, expiry, outstanding. All exportable to Excel |
| O7 | **Employees** | Add or deactivate employees, **permission checkboxes**, reset login |
| O8 | **Activity log** | Who did what and when. Filter by user, entity and action (status changes, invoices, stock adjustments, price changes) |
| O9 | **Settings** | Company profile (placeholders until supplied), bank and UPI, signature/stamp, number prefixes and starting numbers, financial year, terms and declaration, GST rates, units, categories, reorder defaults, expiry alert days, notification channels (API keys kept in a secret store), label sizes |
| O10 | **Invoice cancellation & audit** | Cancel with a reason, list of cancelled documents |
| O11 | **Phase 2** | Tally XML export, e-invoice (IRN/QR), e-way bill, WhatsApp automation |

---

## Count

| Surface | Screens |
|---|---|
| Public website | 6 |
| Customer (portal + app) | 11 |
| Staff (web + app) | 26 |
| Owner-only | 11 |
| **Total distinct screens** | **54** |
