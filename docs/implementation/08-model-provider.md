# Accounting agent model provider

The accounting chat uses KiosAPI's OpenAI-compatible Chat Completions endpoint through the server-side `KiosApiModelProvider`. The default base URL is `https://kiosapi.com/v1`; configure a key in an ignored local environment file as `KIOSAPI_API_KEY`. Never commit actual provider keys or place them in browser code.

The default model is `deepseek-v4-flash-free`, selected from the models returned by the configured key on 2026-10-14. Model IDs and free-group availability can change; check `GET /v1/models` for the account and change `WAKEEL_MODEL` when needed. KiosAPI's official channel says a key must belong to the group containing the selected model and that free-group model availability and capacity can change. The live synthetic tool-call smoke test verifies the current key/model pair without connecting to an ERP.

The model only proposes function calls. The server exposes the five registered finance functions, disables parallel tool calls, validates arguments against Zod schemas, checks authenticated ERP capabilities, and applies the policy engine immediately before a handler. Tool call loops stop after eight model cycles and four registered calls. Provider errors and malformed outputs fail closed and do not include provider response bodies in errors.

Free-model capacity is subject to provider limits and may be less stable than a paid production inference service. This is suitable for synthetic evaluation and early integration work; before production accounting use, validate uptime, data handling terms, throughput, and model-specific tool-call reliability. Arithmetic, ledger checks, policy, approval, and external writes remain server-owned and do not depend on the model's arithmetic claims.

Provider references: [KiosAPI official channel](https://t.me/kiosapi_official) (current base-URL announcement, free model list/group requirements, and availability caveats); [KiosAPI model/pricing page](https://kiosapi.com/pricing); [API docs](https://kiosapi.com/docs).
