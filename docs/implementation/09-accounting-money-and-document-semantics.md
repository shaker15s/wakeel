# Accounting money and document semantics

## Exact values

Server accounting code uses `Money { amount, currency, scale }`, where `amount` is decimal text. `MoneyMath` uses integer coefficients (`BigInt`) for add, subtract, multiply, and compare; it never uses binary floating point for those operations. Currency scales are explicitly allowlisted. Unknown currencies and values with excess decimal places require review instead of silent rounding. Multiplication rounds half away from zero at the requested output scale.

Odoo summary totals are serialized as decimal strings and the connector refuses to aggregate a result containing multiple currencies or an unrecognized currency code. Odoo currently returns JSON numeric values through its legacy RPC adapter, so conversion to decimal text happens at that boundary; for long-term financial auditability, accounting report methods should request native decimal text or preserve the raw JSON numeric token when the target Odoo deployment supports it.

The older `create_draft_invoice` compatibility workflow still accepts JavaScript numbers. New AP/AR workflows must use decimal strings and the `Money` contract. Do not treat the compatibility route as a production-grade accounting write path.

## AP and AR meaning

Canonical document kinds are `customer_invoice` and `vendor_bill`. Odoo move type mapping is explicit: a customer invoice requires customer partner semantics and maps to `out_invoice`; a vendor bill requires vendor semantics and maps to `in_invoice`. A missing or conflicting partner role throws and must be surfaced as review required. This is only a mapping contract; no vendor-bill write is enabled by this change.

## Odoo verification boundary

Odoo's official 19.0 developer documentation describes its external JSON-2 API as a per-model/per-method HTTP API, with access enforced using standard model rights, record rules, and field access. The actual model methods and fields vary by database. The current project connector uses an existing JSON-RPC adapter and has not been verified against a customer Odoo sandbox. New ledger methods remain disabled until the connected database's model schema, access rights, currencies, tax setup, and representative records are verified in a sandbox.

References: [Odoo 19 External JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html), [Odoo 19 vendor bills](https://www.odoo.com/documentation/19.0/applications/finance/accounting/vendor_bills.html), [Odoo 19 accounting localization](https://www.odoo.com/documentation/19.0/developer/howtos/accounting_localization.html).
