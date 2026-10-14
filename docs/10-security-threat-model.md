# Accounting-agent extension (2026-10-14)

The current feature branch extends the original threat model with explicit AP/AR semantics and accounting-task workflows. The model can request only registered, schema-validated functions. Financial draft writes are persisted as tenant/operator-scoped tasks and require a human approval bound to the normalized action hash. A failed or uncertain ERP response is not treated as success; the runtime reconciles by idempotency/read-after-write when the connector supports it and otherwise stops for review. A recent concurrent in-progress write does not trigger a second connector call.

Additional boundaries:

- Explicit operator memory is tenant/operator scoped, user-managed, and never an authorization source or implicit business-policy store.
- Journal calculations produce balanced, unposted proposals; bank matching never mutates statement or ledger data.
- Expense/tax, depreciation, and close-policy gaps return review-required results instead of inferred accounting treatment.
- Odoo accounting read/write capabilities introduced by this branch remain disabled until the target instance schema, version, and permissions are verified in a sandbox. All new live Odoo methods fail closed without making a request.
- The KiosAPI secret is configured locally through an ignored environment file; secret values are not committed or emitted in logs.

For tested scenarios and exact remaining integration gaps, see [the accounting-agent report](implementation/06-accounting-agent-report.md).

