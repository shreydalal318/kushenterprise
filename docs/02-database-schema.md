# (a) Database schema & ER diagram

The full schema is in [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma). It has 45 models, and its migrations are in `packages/db/prisma/migrations/`. The diagrams below are split by area so they stay readable. Only keys and the fields that matter for each diagram are shown.

## Design rules

| Rule | How the schema handles it |
|---|---|
| **One database for website, web app and mobile app** | A single PostgreSQL database. The three apps differ only in role and screens. |
| **Customer pricing: override → price list → default** | `CustomerPrice` (per customer per product) → `PriceListItem` (via `Customer.priceListId`) → `Product.defaultRate`. There is **one row per customer + product and per list + product**, each with an optional `validFrom`/`validTo` (calendar dates, inclusive). Outside that window the next level applies. An inactive price list is ignored. Prices are resolved on the **server** (`resolvePrice` in `packages/core`), so customers never receive other customers' rates or `purchaseCost`. |
| **Codes & barcodes** | `Product.code` is the base SKU, and variant SKUs extend it (`LV-HA600-+21.50`, toric `…-C2.25`). Internal Code 128 barcodes (`KE00000123`) and customer/supplier codes come from the `Counter` table, which is incremented atomically. `ProductVariant.gtin` stores the manufacturer GTIN as 14 digits. |
| **Old invoices keep old prices** | `InvoiceLine.rate`, `description`, `hsnCode`, `gstRate`, batch, expiry, power and serials are copied onto the line when it is saved. Buyer, consignee and supplier details are copied as JSON. Every rate change is also written to `PriceChangeLog`. |
| **Lens powers** | `Product` is the lens model (with its lens attributes and price). `ProductVariant` is one power (`powerSph`, `cylinder`, `addPower`) with its own stock and barcode. You filter by power on `ProductVariant.powerSph`. |
| **Batch / serial / expiry** | `Batch` holds the batch no. and expiry. `SerialUnit` is one physical lens with its status (in stock / sold / returned). Selling a lens records its serial on `InvoiceLine` so it can be traced in a recall. |
| **Stock ledger** | `StockMovement` is append-only (opening, GRN, sale, return, adjustment, transfer, cancel). `StockBalance` keeps the current quantity per variant + batch + location and is updated in the same transaction. A scan reads one indexed row, which keeps it under 300 ms. |
| **FEFO** | Picking sorts `StockBalance` joined to `Batch` by `expiryDate` and suggests the earliest batch that has not expired. |
| **Manufacturer barcodes** | `ProductVariant.gtin` matches GS1 GTINs directly. Any other code is mapped once in `BarcodeAlias`. The GS1 parser reads AI 01 (GTIN), 10 (batch), 17 (expiry) and 21 (serial). |
| **CGST+SGST vs IGST** | `Invoice.taxType` is set when the invoice is saved: if the company state code equals the place of supply (the buyer's or consignee's state) it is intra-state, otherwise inter-state. |
| **Numbering per financial year** | `NumberSeries(docType, financialYear)` has a prefix and a next number. The number is taken with `SELECT … FOR UPDATE`, so numbers never have gaps or duplicates. Examples: `KE/2026-27/0001`, `KE/PI/2026-27/0001`, `KE/PO/2026-27/0001`. |
| **Invoices are never deleted** | `InvoiceStatus` is only `ISSUED` or `CANCELLED`, with `cancelReason`, `cancelledBy` and `cancelledAt`. Cancelling writes `INVOICE_CANCEL` stock movements. Returns go through `CreditNote`. |
| **Ledger & ageing** | `Payment` + `PaymentAllocation` record which invoice each payment settles. Outstanding is `grandTotal − amountPaid − credit notes`. Ageing is worked out from `Invoice.dueDate`. |
| **Permissions on the server** | `User.role` plus `User.permissions[]` (one checkbox per permission). Every API route checks them. `ActivityLog` records who did what. |
| **Offline mobile** | Catalogue tables have `updatedAt` + `deletedAt` for delta sync. Orders and invoices created on the phone carry a `clientRequestId`, so a retry after a network drop never creates a duplicate. |

## Overview

```mermaid
flowchart LR
  subgraph Identity
    User --- Session
    User --- ActivityLog
  end
  subgraph Masters
    Customer --- Address
    Product --- ProductVariant
    Supplier --- SupplierProduct
  end
  subgraph Pricing
    PriceList --- PriceListItem
    CustomerPrice
  end
  subgraph Inventory
    Batch --- SerialUnit
    StockMovement
    StockBalance
  end
  subgraph Sales
    SalesOrder --> Proforma --> Invoice
    SalesOrder --> Invoice
    Invoice --- Payment
    Invoice --- CreditNote
  end
  subgraph Purchasing
    PurchaseOrder --> Grn
  end
  Customer --> SalesOrder
  ProductVariant --> Batch
  Grn --> StockMovement
  Invoice --> StockMovement
  CreditNote --> StockMovement
```

## 1. Identity, customers & pricing

```mermaid
erDiagram
  User ||--o{ Session : has
  User ||--o{ ActivityLog : performs
  User }o--o| Customer : "logs in for (CUSTOMER role)"
  User ||--o{ Customer : "assigned employee"
  Customer ||--o{ Customer : "hospital has doctors"
  Customer ||--o{ Address : "billing / shipping"
  Customer }o--|| State : "stateCode"
  Customer }o--o| PriceList : "assigned"
  PriceList ||--o{ PriceListItem : contains
  PriceListItem }o--|| Product : "rate for"
  Customer ||--o{ CustomerPrice : "overrides"
  CustomerPrice }o--|| Product : "rate for"
  Product ||--o{ PriceChangeLog : history

  User {
    string id PK
    enum role "OWNER | EMPLOYEE | CUSTOMER"
    enum[] permissions
    string mobile UK
    string customerId FK
  }
  Customer {
    string id PK
    enum type "DOCTOR | HOSPITAL | CLINIC"
    string stateCode FK
    string gstin
    decimal creditLimit
    int paymentTermsDays
    string parentId FK "hospital"
    string priceListId FK
  }
  CustomerPrice {
    string customerId FK
    string productId FK
    decimal rate
    date validFrom
    date validTo
  }
  PriceListItem {
    string priceListId FK
    string productId FK
    decimal rate
    date validFrom
    date validTo
  }
```

## 2. Catalogue, barcodes & inventory

```mermaid
erDiagram
  Category ||--o{ Product : groups
  Brand ||--o{ Product : makes
  Product ||--|{ ProductVariant : "powers / sizes"
  ProductVariant ||--o{ BarcodeAlias : "mapped codes"
  ProductVariant ||--o{ Batch : "received in"
  Batch ||--o{ SerialUnit : "individual lenses"
  ProductVariant ||--o{ StockBalance : "on hand"
  Batch ||--o{ StockBalance : ""
  Location ||--o{ StockBalance : ""
  ProductVariant ||--o{ StockMovement : ledger
  Batch ||--o{ StockMovement : ""
  Supplier ||--o{ SupplierProduct : supplies
  SupplierProduct }o--|| Product : ""

  Product {
    string id PK
    string hsnCode
    decimal gstRate
    decimal purchaseCost "owner only"
    decimal defaultRate
    decimal mrp
    enum lensType "MONOFOCAL | TORIC | MULTIFOCAL | EDOF"
    decimal aConstant
    bool trackSerial
  }
  ProductVariant {
    string id PK
    string sku UK
    decimal powerSph "filter by power"
    decimal cylinder
    string barcode UK "Code 128"
    string gtin UK "GS1"
  }
  Batch {
    string id PK
    string batchNo
    date expiryDate "FEFO + alerts"
  }
  StockMovement {
    enum type "OPENING GRN SALE SALES_RETURN PURCHASE_RETURN ADJUSTMENT ..."
    int qty "+in / -out"
    enum reason "required for ADJUSTMENT"
    string refType
    string refId
  }
  StockBalance {
    string variantId PK
    string batchId PK
    string locationId PK
    int qty
    int reserved
  }
```

## 3. Sales: orders → proforma → tax invoice → payments

```mermaid
erDiagram
  Customer ||--o{ SalesOrder : places
  Customer |o--o{ SalesOrder : "for Dr. X"
  SalesOrder ||--|{ SalesOrderLine : ""
  SalesOrder ||--o{ OrderStatusEvent : timeline
  SalesOrder ||--o{ Dispatch : "partial dispatches"
  SalesOrder ||--o{ Proforma : ""
  Proforma ||--|{ ProformaLine : ""
  Proforma |o--o| Invoice : "converted to"
  SalesOrder ||--o{ Invoice : ""
  Invoice ||--|{ InvoiceLine : ""
  Invoice |o--o| Dispatch : ""
  Invoice ||--o{ CreditNote : returns
  CreditNote ||--|{ CreditNoteLine : ""
  Customer ||--o{ Payment : pays
  Payment ||--|{ PaymentAllocation : ""
  PaymentAllocation }o--|| Invoice : settles

  SalesOrder {
    string number UK
    enum status "PLACED CONFIRMED PACKED DISPATCHED DELIVERED | CANCELLED ON_HOLD"
    enum source "PORTAL | MOBILE_APP | STAFF"
    date surgeryDate
    string clientRequestId UK
  }
  SalesOrderLine {
    int qty
    int qtyDispatched "back-order = qty - dispatched"
    decimal rate "resolved customer price"
  }
  Invoice {
    string number UK "KE/2026-27/0001"
    enum status "ISSUED | CANCELLED"
    enum taxType "INTRA_STATE | INTER_STATE"
    json buyerSnapshot
    json consigneeSnapshot
    decimal grandTotal
    string cancelReason
    string irn "phase 2"
  }
  InvoiceLine {
    decimal rate "price at time of sale"
    decimal amount
    decimal gstRate
    string batchNo
    date expiryDate
    string powerLabel
    string[] serialNos
  }
```

## 4. Purchasing: PO → GRN → stock

```mermaid
erDiagram
  Supplier ||--o{ PurchaseOrder : ""
  PurchaseOrder ||--|{ PurchaseOrderLine : ""
  PurchaseOrderLine }o--|| ProductVariant : ""
  PurchaseOrder ||--o{ Grn : "received against"
  Supplier ||--o{ Grn : ""
  Grn ||--|{ GrnLine : "batch, expiry, serials"
  GrnLine }o--|| ProductVariant : ""
  GrnLine ||--o{ StockMovement : "posts GRN (+qty)"

  PurchaseOrder {
    string number UK "KE/PO/2026-27/0001"
    enum status "DRAFT SENT PARTIALLY_RECEIVED RECEIVED CLOSED CANCELLED"
  }
  PurchaseOrderLine {
    int qtyOrdered
    int qtyReceived "shortfall stays open"
    decimal rate
    decimal gstRate
  }
```

## 5. Settings, numbering, notifications

```mermaid
erDiagram
  CompanySettings {
    string gstin "[GSTIN]"
    string stateCode "[State & Code]"
    string pan "[PAN]"
    string drugLicenceNo
    string bankName
    string upiId
    string invoiceDeclaration
    int[] expiryAlertDays "30, 60, 90"
  }
  NumberSeries {
    enum docType PK
    string financialYear PK "2026-27"
    string prefix
    int nextNumber
  }
  User ||--o{ Notification : receives
  User ||--o{ Device : "push tokens"
  Lead {
    string name
    string mobile
    string message
    enum status
  }
```
