# WAKEEL (وكيل) — AI Employee Platform — Master Worklog

> Single source of truth for all agents. READ BEFORE WORKING. APPEND AFTER FINISHING.

---

## TASK ID: 1 — Product Spec, Research & Design System (Agent: orchestrator)

### 1. Product concept (validated against real market: Lindy.ai, Relevance AI, Dust, Cassidy)

**WAKEEL — وكيل — "The AI Employee You Actually Hire".**

An AI employee that works like a real hire:
1. **Discovers existing systems** — you point it at a company URL / describe your stack → it runs REAL web research (z-ai web_search) + LLM analysis → returns a "Systems Map": every system it detected (CRM, ERP, email, storage, finance...) with category, confidence %, detected capabilities, health score. You adopt them into your workspace.
2. **Forges new systems** — describe any system you need ("inventory system for my pharmacy") → LLM generates a full blueprint (entities, typed fields, views, automations) → the system becomes a REAL working mini-app inside the platform with actual CRUD records persisted in SQLite.
3. **Per-user workspace** — each visitor creates an operator profile (name + workspace). Everything (systems, scans, activity, chat) is scoped to that user. User id persisted in localStorage.
4. **Agent dock** — chat with Wakeel; it knows your systems + recent activity and answers in character as your employee.
5. **Activity ledger** — every action (scan, forge, adopt, record, archive) is logged as an ops-ledger feed.

Differentiator (nobody combines both): discovery of existing systems + generation of actually-working new systems, in one dark "mission-control" product.

### 2. Hard constraints (NON-NEGOTIABLE)
- Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui. ONLY route is `/` (src/app/page.tsx) — all views are client-side state switches. No other pages.
- API routes under `src/app/api/**` only. `use api` not server actions.
- z-ai-web-dev-sdk is BACKEND ONLY (never import in client).
- Prisma + SQLite. JSON payloads stored as `String` (prisma schema primitives cannot be lists).
- Footer (landing) sticky to bottom: root wrapper `min-h-screen flex flex-col`, footer `mt-auto`.
- NO indigo/blue. NO generic AI-generated look.

### 3. Design system "OPS DECK" (the anti-generic identity)
- **Mood**: cinematic mission-control / luxury ops console. Permanently dark (no theme toggle — dark IS the brand).
- **Palette**:
  - bg base: `#0A0908` (warm near-black), raised: `#12100D`, hover: `#181510`
  - hairlines/borders: `rgba(232,180,74,0.12)` and neutral `rgba(245,239,228,0.08)`
  - **Accent gold**: `#E8B44A` (primary), deep gold `#B4832A`, pale gold `#F2D492`
  - text: cream `#F5EFE4`, muted `#9A9184`, faint `#5C554A`
  - success/live: `#3ECF8E`, warn: `#E8B44A`, danger: `#E5533D`
- **Fonts** (next/font/google): `Space_Grotesk` (display/headers), `IBM_Plex_Mono` (data/labels/terminal), `IBM_Plex_Sans_Arabic` (Arabic brand accents).
- **Signature elements**:
  - blueprint grid background (fine lines, low opacity) + subtle noise
  - gold "ticker" marquee of live operations on landing
  - radar sweep animation during discovery scans
  - terminal-style agent responses with typed-out feel
  - uppercase micro-labels with tracking `[ IBM Plex Mono, 11px, letter-spacing 0.14em ]`
  - corner brackets / targeting frames on cards, gold hairline dividers
- **Motion (framer-motion)**: staggered section reveals, spring hovers (lift + gold glow), animated counters, layout animations between views, AnimatePresence for view transitions.
- **States**: every interactive element has hover + focus-visible + active + disabled + loading (skeletons/spinners). Empty states illustrated with mono ASCII-ish art + CTA. Errors as toast (sonner) + inline.

### 4. Data model (Prisma / SQLite — JSON as String)
```prisma
model User         { id String @id @default(cuid()); name String; workspace String; role String?; createdAt DateTime @default(now()); systems AiSystem[]; scans ScanSession[]; activities Activity[]; chats ChatMessage[] }
model AiSystem     { id String @id @default(cuid()); userId String; user User @relation(fields:[userId], references:[id], onDelete: Cascade); name String; description String; category String; icon String; color String; origin String (DISCOVERED|CREATED); status String @default("ACTIVE") (ACTIVE|DRAFT|ARCHIVED); health Int @default(90); confidence Int?; source String?; blueprint String @default("{}"); capabilities String @default("[]"); records SystemRecord[]; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt }
model SystemRecord { id String @id @default(cuid()); systemId String; system AiSystem @relation(fields:[systemId], references:[id], onDelete: Cascade); data String; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt }
model ScanSession  { id String @id @default(cuid()); userId String; user User @relation(fields:[userId], references:[id], onDelete: Cascade); target String; notes String?; status String @default("RUNNING") (RUNNING|COMPLETE|FAILED); systemsFound Int @default(0); result String @default("{}"); createdAt DateTime @default(now()) }
model Activity     { id String @id @default(cuid()); userId String; user User @relation(fields:[userId], references:[id], onDelete: Cascade); type String (SCAN|FORGE|ADOPT|ARCHIVE|RESTORE|DELETE|RECORD|CHAT|STATUS); title String; detail String?; status String @default("DONE") (RUNNING|DONE|FAILED); createdAt DateTime @default(now()) }
model ChatMessage  { id String @id @default(cuid()); userId String; user User @relation(fields:[userId], references:[id], onDelete: Cascade); role String (USER|AGENT); content String; createdAt DateTime @default(now()) }
```

### 5. API contract (all JSON, relative fetch from client)
| Method & path | Body / query | Returns |
|---|---|---|
| POST `/api/users` | `{name, workspace, role?}` | `{user}` (creates) |
| GET `/api/users/[id]` | — | `{user, stats:{systems, discovered, created, records, scans}}` |
| GET `/api/users/[id]/systems` | — | `{systems: AiSystem[]}` (newest first) |
| POST `/api/discovery/scan` | `{userId, target, notes?}` | `{scan, systems[]}` — runs web_search + LLM classification, creates DISCOVERED systems + COMPLETE scan + activity |
| GET `/api/scans?userId=` | — | `{scans: ScanSession[]}` |
| POST `/api/systems/forge` | `{userId, prompt}` | `{system}` — LLM blueprint → CREATED system + activity |
| GET `/api/systems/[id]` | — | `{system, records[]}` |
| PATCH `/api/systems/[id]` | `{status?, name?, description?}` | `{system}` (+activity) |
| DELETE `/api/systems/[id]` | — | `{ok:true}` (+activity) |
| POST `/api/systems/[id]/records` | `{data: object}` | `{record}` (+activity) |
| PATCH `/api/records/[id]` | `{data}` | `{record}` |
| DELETE `/api/records/[id]` | — | `{ok:true}` |
| GET `/api/activity?userId=` | — | `{activities[]}` (newest first, limit 50) |
| POST `/api/agent/chat` | `{userId, message}` | `{reply, messageId}` — saves both roles; LLM has workspace context (systems list + last activities) |
| GET `/api/agent/chat?userId=` | — | `{messages[]}` (last 50) |

Error shape: `{ error: string }` with proper status codes. All routes must handle malformed input with 400.

### 6. Frontend architecture (single page `/`)
- `src/app/page.tsx` → thin client shell: `<AppShell/>` (components/app/app-shell.tsx) managing view state: `landing → onboarding(dialog) → console`.
- `src/components/app/landing/*` — hero (generated hero image bg + radar motif), "how it works" (3 steps), capabilities grid, big CTA, sticky footer w/ mt-auto.
- `src/components/app/console/*` — top status bar (workspace, clock, live dot), left sidebar nav (Overview / Discovery / Systems / Forge / Activity), main panel per view, right agent dock (collapsible chat drawer).
- `src/lib/store.ts` — zustand: userId (localStorage `wakeel:user`), current view, agent dock state.
- Fetch layer `src/lib/api.ts` typed helpers with React Query.
- Landing copy: English primary + Arabic brand accents (وكيل appears in logo/hero eyebrow).

### 7. Asset generated
- `public/hero-nebula.png` — abstract dark gold topology (see Task 4 log below) used as hero backdrop with dark overlay.

### 8. Environment
- `bun run dev` on :3000 (already running). `bun run lint` must pass. `bun run db:push` after schema edits.

---
---
Task ID: 3
Agent: orchestrator (Z.ai Code)
Task: Completion of frontend views + integration, bug fixing, lint/typecheck, full agent-browser E2E verification

Work Log:
- Both parallel subagents (2-a, 2-b) hit their time budget but delivered ~95% of scope before stopping. Inventory taken: backend complete (6 models pushed, 15 route files, LLM + web-search integration), frontend missing only `views/forge.tsx` and `views/activity.tsx`.
- Authored `src/components/app/console/views/forge.tsx` (prompt + example chips, staged forge pipeline with hammer/scan-line animation, blueprint reveal card with fields table + sample records + automations, recent forges list) matching existing view patterns exactly.
- Authored `src/components/app/console/views/activity.tsx` (type filter chips, mono ledger rows with TypeChip/StatusDot/relative time, 15s live refresh, skeletons + empty states).
- Fixed 9 ESLint errors: JSX `//` text nodes (agent-dock, discovery), setState-in-effect (LiveClock → rAF first paint; dialog reset → adjust-state-during-render pattern; scan/forge stage counters → seed stage 1 in submit handler + interval-only effect), static-components false positives → targeted eslint-disable at JSX usage.
- Generated brand assets with image-generation skill: `public/hero-nebula.png` (dark-gold topology), `public/radar-orb.png` (radar rings) — used in landing hero.
- **Critical runtime bug found via agent-browser E2E**: clicking a system card threw `ReferenceError: systemDetailId is not defined` — `store.ts` had zustand shorthand `set({ systemDetailId })` with parameter named `systemId`. Fixed to `openSystemDetail: (id) => set({ systemDetailId: id })`. Lesson: lint passed but tsc was never run — added `bunx tsc --noEmit` to verification loop; also fixed a real TS error in `api-client.ts` (message fallback typing).
- Added 180s AbortSignal timeout to the shared `api()` fetcher so slow LLM/web-search calls can never hang the UI forever.
- Smoke-tested every API for real: user creation, discovery scan on Jumla.com + Talabat.com (real web_search + LLM classification, honest low-confidence fallbacks), forge "Pharmacy Inventory" + "Client Onboarding Tracker" (blueprints with typed fields + 3 sample records each), agent chat (context-aware answers citing actual system names + record counts), stats, activity.
- Full agent-browser golden path verified with screenshots: landing (hero/protocol/capabilities/console-preview/CTA/sticky footer) → onboarding (Layla Hassan / Nova Retail) → Overview live stats → Discovery scan with radar pipeline → 6 systems registered → detail dialog → add-record dynamic form (text/select/boolean) → record saved (toast + ledger) → delete flow with confirm → Forge from UI → Agent dock chat (desktop panel + mobile sheet) → Activity filters → mobile 390px responsive layout.

Stage Summary:
- Product is END-TO-END FUNCTIONAL: discover existing systems (real web research) + forge working new systems (LLM blueprints with real CRUD records) per operator, with context-aware agent chat and full ops ledger.
- Verified: `bun run lint` 0 errors; `tsc --noEmit` 0 errors in src/; zero browser console errors on fresh load; landing + console + all 5 views + dock verified visually at 1280px and 390px.
- Known cosmetic note: during very long scans (>60s) the pipeline stage ticker can appear frozen in headless/background tabs due to browser timer throttling — not a code bug; the request itself completes and results render.
- Remaining ideas for next phases: rich records (edit-in-place row), CSV export per system, per-system dashboards with recharts, automations simulation feed, Arabic UI toggle, share/read-only system links.
---
Task ID: 4
Agent: webDevReview (cron round 1)
Task: QA assessment + new features (record editing, CSV export, per-system pulse dashboard, ⌘K command palette) + styling details

Work Log:
- Reviewed worklog Task 3 + dev.log: phase stable, no new user files in upload/. QA pass via agent-browser showed a healthy app (session persisted, zero console/runtime errors on fresh load) → proceeded to feature development.
- **Record edit-in-place** (closes the only backend-UI gap): added `updateRecord()` to api-client (PATCH /api/records/[id] existed unused), `editingId`/`editDraft` state + `editRecord` mutation in system-detail-dialog, "EDIT" item in row action menu (gold focus style, disabled when archived), prefilled dynamic edit form panel (AnimatePresence, gold-tinted, EDITING RECORD header, SAVE CHANGES + DISCARD), and gold highlight on the row being edited. Verified E2E: edited a record's name + priority via selects/switch → "Record updated" toast → table + ledger updated.
- **CSV export**: `exportSystemCsv()` (proper quoting/escaping, kebab-case filename) + "CSV" button in the records header, disabled at 0 records. Click verified error-free (blob download can't be asserted in headless).
- **Per-system pulse dashboard**: new "PULSE · LAST 14 DAYS" section at the top of the detail dialog — RECORDS / LAST WRITE (max updatedAt) / TYPED FIELDS stats + `RecordsPulse` gold bar chart (records per day, 14-day buckets, hover tooltips, min-height floors). Verified rendering with real data.
- **⌘K command palette** (`command-palette.tsx`): cmdk `CommandDialog` in OPS-DECK styling — Views group (5 tabs), Open system group (top 8 with icon/origin/record-count), Agent group (open dock), Recent ledger group (last 5 activities), mono footer with workspace totals. Wired via new `paletteOpen`/`setPaletteOpen` zustand state, global ⌘K/Ctrl+K listener, `<CommandPalette/>` in Console, and a SEARCH ⌘K button in the status bar (visible md+). Verified: hotkey opens, button opens, navigation works.
- **Backend fix**: `GET /api/users/[id]/systems` now includes `_count: { records: true }` — systems cards across registry/palette/overview now show true record counts ("4 RECORDS") instead of falling back to capability counts.
- **Styling details**: `prefers-reduced-motion` support (all signature animations disable), ticker hover-pause fallback utility (component already had group-hover pause), sidebar nav hover now gold-tinted with subtle translate-x, status bar gained the SEARCH ⌘K affordance.

Stage Summary:
- All new features verified in-browser; lint 0 errors; tsc src/ 0 errors; zero runtime/console errors after fresh reload with error listeners armed.
- The recurring "1 Issue" dev-tools badge is Next.js dev-mode tooling (no accompanying console/runtime errors) — not a product bug; re-confirmed clean on fresh load.
- Next-phase candidates (unchanged priorities + new): per-system analytics tab (recharts, field completion rates), automations simulation feed, Arabic UI toggle, share/read-only system links, record keyboard navigation, multi-record bulk actions.
