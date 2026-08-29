# WAKEEL — 02. Universal ERP Contract Specification v0.1

## 1. Overview
The **Universal ERP Contract** defines the single canonical data and operation schema for Wakeel. No connector exposes raw database tables or vendor-specific SQL directly to the Agent. Instead, every ERP translates its native models into canonical business entities.

---

## 2. Canonical Business Entities

| Canonical Entity | Description | Default Odoo 19 Model | Default ERPNext DocType |
|---|---|---|---|
| `customer` | Business clients & contacts | `res.partner` | `Customer` |
| `sale_order` | Sales orders & quotes | `sale.order` | `Sales Order` |
| `invoice` | Customer invoices & bills | `account.move` | `Sales Invoice` |
| `product` | Inventory items & services | `product.product` | `Item` |
| `purchase_order` | Vendor purchase orders | `purchase.order` | `Purchase Order` |

---

## 3. Capability States & Safety Enforcement

1. **`CONFIRMED`**: Inspected and verified against live ERP user rights. **Only these become executable tools.**
2. **`INFERRED`**: Suggested based on business profile, but disabled until permissions are confirmed.
3. **`UNAVAILABLE`**: Explicitly blocked or unsupported by ERP module configuration.
4. **`UNKNOWN`**: Uninspected state.

---

## 4. Universal Operation Verbs
- **`searchEntities(entityId, query)`**
- **`getEntityById(entityId, id)`**
- **`getSalesSummary(dateRange)`**
- **`getReceivablesSummary()`**
- **`getInventoryLevels(threshold)`**
- **`createDraftInvoice(payload)`** *(Protected by Human Approval)*
- **`createDraftPurchaseOrder(payload)`** *(Protected by Human Approval)*
