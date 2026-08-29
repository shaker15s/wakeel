# WAKEEL — Rebuild & Rescue Master Plan v1.0

**Goal**: Rebuild Wakeel around its true thesis: an **AI Employee that operates real customer ERP systems (starting with Odoo 19)** through natural language, with real permissions, verifiable reads, safe policy-governed writes with human-in-the-loop approvals, and full auditability.

---

## 1. Core Thesis

```
┌─────────────────────────────────────────────────────────────┐
│                      OPERATOR / HUMAN                       │
└──────────────────────────────┬──────────────────────────────┘
                               │ "كم مبيعات هذا الشهر؟"
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      WAKEEL AI EMPLOYEE                     │
│  - Natural Language Intent Understanding                    │
│  - Semantic Mapping (Arabic/English ↔ Canonical Business)   │
│  - Tool Registry & Typed Operations                         │
│  - Policy Engine & Human Approval Gateway                   │
│  - Full Audit Trail & Memory Layer                          │
└──────────────────────────────┬──────────────────────────────┘
                               │ Universal ERP Contract
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   REAL ERP CONNECTOR RUNTIME                │
│  - Odoo 19 External JSON-2 API / Access Model               │
│  - Live Permissions & Auth Verification                     │
│  - Grounded Entity Extraction & Mutation Execution          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   REAL ERP (SOURCE OF TRUTH)                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Universal Verbs
- **Connect**: Authenticate against real ERP credentials.
- **Discover**: Inspect real schemas, fields, relations, and permissions.
- **Verify**: Confirm access levels and health status.
- **Ask**: Grounded query execution via typed tools.
- **Approve**: Structured authorization cards for financial/data mutations.
- **Execute**: Run through connector and verify result.
