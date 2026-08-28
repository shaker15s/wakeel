"use client";

import { useWakeel } from "@/lib/store";

/**
 * WAKEEL bilingual dictionary — English (source of truth) + Arabic.
 *
 * Arabic copy rules for this product:
 *  - Modern Standard Arabic with an ops-console tone (professional, crisp).
 *  - Micro-labels keep their mission-control flavor (e.g. «السجل», «الاستكشاف»).
 *  - Brand names (WAKEEL / Wakeel, system names, ⌘K) stay Latin.
 *  - No letter-spacing is applied to Arabic at the CSS layer (see globals.css).
 */

export type Lang = "en" | "ar";

export const en = {
  common: {
    cancel: "Cancel",
    delete: "Delete",
    close: "Close",
    clear: "Clear",
    save: "Save",
    loading: "Loading…",
    per: "·",
    skip: "Skip to main content",
  },

  nav: {
    capabilities: "Capabilities",
    protocol: "Protocol",
    console: "Console",
    enter: "Enter Console",
  },

  hero: {
    eyebrow: "وكيل — OPERATIONAL AI EMPLOYEE",
    titleA: "Hire the employee",
    titleB: "that never clocks out.",
    sub: "Wakeel discovers the systems your company already runs — CRM, ERP, storage, finance — then forges the ones you are missing, on demand. One hire. Your whole operation.",
    ctaPrimary: "Hire your Wakeel",
    ctaSecondary: "Explore the console",
    statTasks: "TASKS EXECUTED / HR",
    statSystems: "SYSTEMS MAPPED",
    statResponse: "MEAN RESPONSE",
    statUptime: "UPTIME",
    chip1: "SYSTEMS MAPPED 12",
    chip2: "SCAN ACTIVE",
    chip3: "UPTIME 99.98%",
  },

  ticker: {
    items: [
      "SCAN COMPLETE — 4 SYSTEMS MAPPED FOR NOVA RETAIL",
      "FORGED ‘INVENTORY PRO’ — 6 FIELDS, 3 VIEWS",
      "ADOPTED ‘SAGE ERP’ — CONFIDENCE 94%",
      "RECORD #4821 LOGGED IN ‘CLIENT ONBOARDING’",
      "AUTOMATION WIRED — LOW-STOCK ALERT → EMAIL",
      "OPERATOR LAYLA ACTIVATED WORKSPACE ‘NOVA’",
      "SCAN COMPLETE — 7 SYSTEMS MAPPED FOR ATLAS LOGISTICS",
      "FORGED ‘LEAVE TRACKER’ — 4 FIELDS, 2 AUTOMATIONS",
    ],
  },

  protocol: {
    eyebrow: "THE PROTOCOL",
    titleA: "Three moves to your",
    titleB: " first AI hire.",
    copy: "No sales calls. No implementation year. Wakeel operates like a real employee — it learns your operation, then it works.",
    s1t: "ONBOARD",
    s1c: "Register your operator profile. Name your workspace. Wakeel wakes up already knowing who you are and what you run — no integrations, no paperwork.",
    s2t: "DISCOVER",
    s2c: "Point Wakeel at your company URL or describe your stack. Real web research maps every system you already run — CRM, ERP, storage, finance — with confidence scores.",
    s3t: "FORGE",
    s3c: "Describe any system you need in plain language. Wakeel forges a working mini-app — typed entities, views, automations — materialized live in your workspace.",
  },

  caps: {
    eyebrow: "CAPABILITIES",
    titleA: "An employee with a",
    titleB: " full toolkit.",
    copy: "Six operating capabilities, one console. Wakeel is not a chatbot with plugins — it is staff.",
    c1t: "System Discovery",
    c1c: "Real web research pointed at your company URL maps every system you already run — with category, capabilities and a confidence score.",
    c2t: "System Forging",
    c2c: "Describe any tool you need in plain language. Wakeel forges a working system with entities, typed fields and automations in one pass.",
    c3t: "Agent Dock",
    c3c: "Chat with your employee. It knows your systems, your records and everything that happened in the ledger this week — and answers in character.",
    c4t: "Structured Records",
    c4c: "Every forged system is a real mini-app: typed fields, CRUD records, persisted in your workspace. Not a mockup — actual software.",
    c5t: "Ops Ledger",
    c5c: "Every scan, forge, adoption and edit is logged to a mission-control ledger. Nothing your AI employee does happens in the dark.",
    c6t: "Scoped by Design",
    c6c: "Per-operator workspaces. Your systems, your records, your trail — nothing shared across operators, nothing leaked.",
  },

  preview: {
    eyebrow: "CONSOLE",
    titleA: "Mission control for",
    titleB: " your operation.",
    copy: "Discovery, forged systems, records and a live ops ledger — with your AI employee one keystroke away in the agent dock.",
    systemsMap: "SYSTEMS MAP",
    fourActive: "4 ACTIVE",
    thSystem: "System",
    thOrigin: "Origin",
    thHealth: "Health",
    agentDock: "AGENT DOCK",
    onDuty: "ON DUTY",
    operator: "OPERATOR",
    wakeel: "WAKEEL",
    msgPlaceholder: "Message Wakeel…",
    chatA1: "Low-stock sweep done. 3 items under threshold in Inventory Pro — shall I draft purchase orders?",
    chatU1: "Yes, and ping the warehouse channel when they're sent.",
    chatA2: "Drafted 3 POs. Wired the alert → warehouse channel automation. Logged to ledger.",
  },

  cta: {
    eyebrow: "FINAL TRANSMISSION",
    titleA: "Your operations deserve ",
    titleB: "a professional.",
    copy: "Thirty seconds of onboarding. One operator profile. Wakeel starts the discovery sweep the moment it clocks in.",
    button: "Hire your Wakeel",
  },

  footer: {
    tagline: "موظفك الذكي — شغال معاك.",
    blurb: "The AI employee you actually hire. Discovers your systems, forges the missing ones, and never clocks out.",
    product: "PRODUCT",
    protocolCol: "PROTOCOL",
    status: "STATUS",
    allSystems: "ALL SYSTEMS OPERATIONAL",
    uptime: "UPTIME · 99.98%",
    meanResp: "MEAN RESPONSE · 0.4s",
    lastSweep: "LAST SWEEP · 2m AGO",
    rights: "© 2025 Wakeel Systems. All rights reserved.",
    builtFor: "BUILT FOR OPERATORS · و",
    lCapabilities: "Capabilities",
    lConsole: "Console",
    lAgentDock: "Agent dock",
    lOnboard: "Onboard",
    lDiscover: "Discover",
    lForge: "Forge",
  },

  onb: {
    badge: "● NEW OPERATOR REGISTRATION",
    title: "Activate your Wakeel",
    desc: "Register an operator profile. Everything — systems, records, activity — is scoped to you.",
    fullName: "Full name *",
    namePh: "e.g. Layla Hassan",
    workspace: "Workspace name *",
    wsPh: "e.g. Nova Retail",
    role: "Role",
    rolePh: "Select role (optional)",
    roles: ["Founder", "Operations", "Engineer", "Manager", "Other"],
    activate: "ACTIVATE WAKEEL",
    activating: "ACTIVATING…",
    storedNote: "Stored locally · wakeel:user · no email required",
    errName: "Full name is required.",
    errShort: "That name is too short.",
    errWs: "Workspace name is required.",
    toastOk: "Operator activated",
    toastOkDesc: (name: string) => `Welcome aboard, ${name} — your console is live.`,
    toastErr: "Activation failed",
    or: "— OR —",
    importCta: "Have a workspace file? Import it instead",
    importing: "IMPORTING…",
  },

  boot: {
    booting: "WAKEEL // BOOTING",
    title: "WAKEEL OPS DECK",
    sub: "INITIALIZING CONSOLE",
    lines: [
      "AUTH … OPERATOR ACCEPTED",
      "SYSTEMS BUS … ONLINE",
      "AGENT LINK … HANDSHAKE OK",
      "LEDGER … SYNCED",
    ],
    ready: "CONSOLE READY",
    skip: "PRESS ANY KEY TO SKIP",
  },

  sb: {
    search: "Search",
    agentDock: "Agent dock",
    systems: "SYSTEMS",
    operational: "OPERATIONAL",
    operatorMenu: "Operator menu",
    switchOp: "Switch operator",
    switchedTitle: "Operator switched",
    switchedDesc: "Local identity cleared — back to the landing pad.",
    fallbackWorkspace: "WAKEEL",
    fallbackName: "operator",
    openPalette: "Open command palette",
    exportOp: "Export workspace",
    exportTitle: "Workspace exported",
    exportDesc: (s: number, r: number) => `${s} system${s === 1 ? "" : "s"} · ${r} record${r === 1 ? "" : "s"} · JSON saved to your machine.`,
    exportErr: "Export failed",
    importOp: "Import workspace",
    importTitle: "Workspace imported",
    importDesc: (s: number, r: number) =>
      `${s} system${s === 1 ? "" : "s"} · ${r} record${r === 1 ? "" : "s"} restored into a fresh operator workspace.`,
    importInvalid: "That file is not a Wakeel workspace export (wakeel.workspace/v1).",
    importErr: "Import failed",
    workspaceSection: "WORKSPACE DATA",
    replayTour: "Replay guided tour",
  },

  tour: {
    aria: "Guided tour",
    skip: "Skip tour",
    back: "Back",
    next: "Next",
    finish: "Finish",
    stepOf: (i: number, n: number) =>
      `STOP ${String(i).padStart(2, "0")} / ${String(n).padStart(2, "0")}`,
    dots: "Tour progress",
    doneTitle: "Tour complete",
    doneDesc: "Wakeel is on duty. Press ⌘K anytime to find your way around.",
    steps: [
      {
        kicker: "OVERVIEW",
        title: "Your morning dashboard",
        body: "KPIs, your latest systems and the freshest ledger lines — with one-click actions to run a discovery scan or forge a new system.",
      },
      {
        kicker: "DISCOVERY",
        title: "Map what you already run",
        body: "Point Wakeel at your company URL or describe your stack. It researches the live web and maps every system you already use — CRM, ERP, storage, finance.",
      },
      {
        kicker: "SYSTEMS",
        title: "Everything lives here",
        body: "Every discovered or forged system. Open one for records, automations, analytics, CSV import and read-only share links.",
      },
      {
        kicker: "FORGE",
        title: "Missing a tool? Say the word",
        body: "Describe any system in one sentence — “inventory for my pharmacy” — and Wakeel forges a real working mini-app with typed fields and views.",
      },
      {
        kicker: "ACTIVITY",
        title: "The ops ledger",
        body: "Every scan, record, automation and chat is logged as an audit trail. Your employee is always accountable.",
      },
      {
        kicker: "AGENT DOCK",
        title: "Your employee, on call",
        body: "Ask about your systems, records or next automations. Wakeel answers with your live workspace context — suggested prompts included.",
      },
      {
        kicker: "SHORTCUTS",
        title: "Move at operator speed",
        body: "⌘K opens the command palette. Keys 1–5 jump straight to a view. That’s the whole tour — Wakeel is on duty.",
      },
    ],
  },

  impv: {
    eyebrow: "PRE-FLIGHT CHECK",
    title: "Import this workspace?",
    desc: "Inspect exactly what this file restores before it touches your console. Confirming creates a fresh operator workspace from the file.",
    statSystems: "SYSTEMS",
    statRecords: "RECORDS",
    exported: "EXPORTED",
    forged: "FORGED",
    discovered: "DISCOVERED",
    recShort: "REC",
    collisions: (n: number) =>
      n === 1
        ? "1 name also exists in your current workspace — both copies stay independent:"
        : `${n} names also exist in your current workspace — both copies stay independent:`,
    noCollisions: "No name collisions with your current workspace.",
    note: "The file restores into a brand-new operator — your current session switches to it. Nothing is merged.",
    cancel: "CANCEL",
    confirm: "IMPORT WORKSPACE",
    importing: "IMPORTING…",
  },

  side: {
    overview: "Overview",
    discovery: "Discovery",
    systems: "Systems",
    forge: "Forge",
    activity: "Activity",
    version: "WAKEEL v0.1 · و",
    navLabel: "Console navigation",
    hintKeys: "PRESS 1–5 TO SWITCH VIEWS",
  },

  ov: {
    consoleTag: "OPERATOR CONSOLE",
    greetNight: "Burning the midnight oil",
    greetMorning: "Good morning",
    greetAfternoon: "Good afternoon",
    greetEvening: "Good evening",
    operatorFallback: "operator",
    subEmpty: "Wakeel is on duty. Start with a discovery scan or forge your first system.",
    subWith: (systems: number, records: number, ws: string) =>
      `Wakeel is watching ${systems} system${systems === 1 ? "" : "s"} and ${records} record${records === 1 ? "" : "s"} in ${ws}.`,
    wsFallback: "your workspace",
    statSystems: "SYSTEMS",
    statRecords: "RECORDS",
    statScans: "SCANS RUN",
    statActions: "ACTIONS LOGGED",
    runDiscovery: "Run a discovery",
    forgeNew: "Forge a new system",
    latest: "SYSTEMS · LATEST",
    allSystems: "All systems",
    noSystemsT: "NO SYSTEMS YET",
    noSystemsC: "Run a discovery sweep to map what you already use, or forge a brand-new system from a sentence.",
    runDiscoverySm: "Run discovery",
    forgeSm: "Forge",
    recentActivity: "RECENT ACTIVITY",
    fullLedger: "Full ledger",
    ledgerEmpty: "— LEDGER EMPTY —",
    rec: "REC",
    recentSystemsLabel: "Recent systems",
    recentActivityLabel: "Recent activity",
  },

  disc: {
    eyebrow: "RECON",
    title: "SYSTEM DISCOVERY",
    sub: "Point Wakeel at a company URL or name. It runs real web research and maps every system it can detect — then files them to your workspace.",
    target: "Target *",
    targetPh: "acme.com or Acme Corporation",
    notes: "Notes for the sweep",
    notesPh: "Anything Wakeel should know — industry, tools you suspect, region…",
    runScan: "Run discovery scan",
    scanning: "SCANNING…",
    errTarget: "A target is required — URL or company name.",
    errTitle: "⚠ SCAN ERROR",
    stage1: "Resolving target…",
    stage2: "Querying public web…",
    stage3: "Extracting signals…",
    stage4: "Classifying systems…",
    stage5: "Scoring confidence…",
    health: "HEALTH",
    noScansT: "NO SCANS ON RECORD",
    noScansC: "Run your first discovery sweep — Wakeel will map the stack you already run and flag what it can adopt.",
    history: "SCAN HISTORY",
    found: "found",
    clear: "Clear",
    historyLabel: "Scan history",
    resultsLabel: "Latest scan results",
    fallbackSummary: (n: number, target: string) => `Detected ${n} systems for ${target}.`,
    toastOk: "Scan complete",
    toastOkDesc: (n: number, target: string) => `${n} systems mapped for ${target}.`,
    toastErr: "Scan failed",
  },

  sys: {
    eyebrow: "REGISTRY",
    title: "SYSTEMS",
    loading: "Loading your registry…",
    statsLine: (n: number, active: number) =>
      `${n} system${n === 1 ? "" : "s"} · ${active} active · discovered and forged by Wakeel.`,
    emptyT: "REGISTRY EMPTY",
    emptyC: "Nothing in your workspace yet. Run a discovery sweep to adopt existing systems, or forge a brand-new one from a sentence.",
    runDiscovery: "Run discovery",
    forgeSystem: "Forge system",
    kbdNav: "navigate",
    kbdOpen: "open",
    records: (n: number) => `${n} RECORD${n === 1 ? "" : "S"}`,
    capabilities: (n: number) =>
      `${n} CAPABILIT${n === 1 ? "Y" : "IES"}`,
    archived: "ARCHIVED",
  },

  forge: {
    eyebrow: "FABRICATION",
    title: "SYSTEM FORGE",
    sub: "Describe any system you need in one sentence. Wakeel designs the entities, wires automations and ships a working system — with sample records — straight into your registry.",
    brief: "System brief *",
    briefPh: "e.g. An inventory system for my pharmacy with batches, expiry alerts and suppliers…",
    ex1: "Pharmacy inventory system",
    ex2: "Client onboarding tracker",
    ex3: "Employee leave management",
    ex4: "Warehouse shipment log",
    examplesLabel: "Prompt examples",
    forgeBtn: "Forge system",
    forging: "FORGING…",
    errBrief: "Describe the system in at least a few words.",
    errTitle: "⚠ FORGE ERROR",
    stage1: "Parsing requirements…",
    stage2: "Designing entities…",
    stage3: "Wiring automations…",
    stage4: "Materializing system…",
    entityFields: (n: number) => `ENTITY · ${n} FIELDS`,
    sampleRecords: "SAMPLE RECORDS",
    automations: "AUTOMATIONS",
    openSystem: "Open system",
    recent: "RECENT FORGES",
    coldT: "FORGE COLD",
    coldC: "No forged systems yet. Drop a brief above and Wakeel will fabricate your first one in seconds.",
    recentLabel: "Recent forges",
    resultLabel: "Forge result",
    rec: "rec",
    toastOk: "System forged",
    toastOkDesc: (name: string) => `${name} is live in your registry.`,
    toastErr: "Forge failed",
  },

  act: {
    eyebrow: "LEDGER",
    title: "ACTIVITY",
    sub: "Every action Wakeel takes on your behalf — timestamped, nothing hidden.",
    live: "LIVE · REFRESH 15S",
    all: "ALL",
    filters: {
      SCAN: "SCAN",
      FORGE: "FORGE",
      RECORD: "RECORD",
      AUTOMATION: "AUTOMATION",
      CHAT: "CHAT",
      STATUS: "STATUS",
      DELETE: "DELETE",
      SHARE: "SHARE",
      IMPORT: "IMPORT",
    },
    emptyT: "LEDGER EMPTY",
    emptyC: "Once you run a scan, forge a system or chat with Wakeel, every action lands here.",
    noEventsT: (t: string) => `NO ${t} EVENTS`,
    noEventsC: "No events of this type yet — switch the filter or go do something worth logging.",
    filterLabel: "Filter by type",
  },

  detail: {
    tabOverview: "OVERVIEW",
    tabRecords: "RECORDS",
    tabAutomations: "AUTOMATIONS",
    tabAnalytics: "ANALYTICS",
    tablistLabel: "System detail sections",
    pulse: "PULSE · LAST 14 DAYS",
    recordsStat: "RECORDS",
    lastWrite: "LAST WRITE",
    typedFields: "TYPED FIELDS",
    blueprint: "BLUEPRINT · ENTITY FIELDS",
    noFields: "No typed fields were specified for this system.",
    automations: "AUTOMATIONS",
    moreAuto: (n: number) => `+${n} MORE · OPEN AUTOMATIONS →`,
    danger: "DANGER ZONE",
    restore: "Restore system",
    archive: "Archive system",
    delete: "Delete system",
    created: "CREATED",
    delTitle: "Delete this system?",
    delDesc: (name?: string) =>
      `${name ?? "This system"} and all of its records will be permanently removed. This action cannot be undone.`,
    toastArchived: "System archived",
    toastRestored: "System restored",
    toastUpdErr: "Update failed",
    toastDelOk: "System deleted",
    toastDelDesc: "It and all of its records are gone. Logged to the ledger.",
    toastDelErr: "Delete failed",
    loadingTitle: "Loading system",
    unavailTitle: "System unavailable",
    unavailFallback: "This system could not be loaded.",
    pulseAria: "Records created per day, last 14 days",
    pulseTip: (day: string, n: number) => `${day} · ${n} record${n === 1 ? "" : "s"}`,
    d14: "D-14",
    today: "TODAY",
  },

  recs: {
    header: (n: number) => `RECORDS · ${n}`,
    add: "Add record",
    cancel: "Cancel",
    editing: "EDITING RECORD",
    saveChanges: "SAVE CHANGES",
    discard: "DISCARD",
    saveRecord: "SAVE RECORD",
    saving: "SAVING…",
    noFields: "This system has no blueprint fields — records would be empty objects.",
    noRecordsT: "NO RECORDS YET",
    noRecordsC: "Add the first record to start filling this system.",
    selected: (n: number) => `${n} SELECTED`,
    export: "Export",
    clearSel: "Clear",
    deleteSel: "Delete",
    selectAll: "Select all records",
    selectOne: (v: string) => `Select record ${v}`,
    recActions: "Record actions",
    edit: "Edit",
    kbdNav: "navigate",
    kbdSelect: "select",
    kbdEdit: "edit",
    kbdClear: "dismiss",
    delBulkTitle: (n: number) => `Delete ${n} record${n === 1 ? "" : "s"}?`,
    delBulkDesc: (name: string) =>
      `The selected records will be permanently removed from ${name}. This action cannot be undone.`,
    toastAddOk: "Record added",
    toastAddDesc: "Logged to the ledger and saved to your system.",
    toastAddErr: "Could not add record",
    toastDelOk: "Record deleted",
    toastDelDesc: "Removed from the system.",
    toastDelErr: "Delete failed",
    toastUpdOk: "Record updated",
    toastUpdDesc: "Changes saved and logged to the ledger.",
    toastUpdErr: "Update failed",
    toastBulkOk: (n: number) => `${n} record${n === 1 ? "" : "s"} deleted`,
    toastBulkDesc: "Bulk removal logged to the ledger.",
    toastBulkErr: "Bulk delete failed",
    true: "TRUE",
    false: "FALSE",
    selectField: (label: string) => `Select ${label.toLowerCase()}`,
    seed: "SEED SAMPLE DATA",
    seeding: "SEEDING…",
    seedOk: "Sample data grown",
    seedOkDesc: (n: number) =>
      `Wakeel added ${n} realistic record${n === 1 ? "" : "s"} — logged to the ledger.`,
    seedErr: "Seed failed",
    csvImport: "IMPORT CSV",
    csvNoFields: "NO BLUEPRINT FIELDS TO MAP",
    csvTitle: "CSV COLUMN MAPPING",
    csvDesc:
      "Match each system field to a column from your file. Values are coerced to the field's type on import — rows are previewed before anything is written.",
    csvRows: (n: number) => `${n} ROW${n === 1 ? "" : "S"} DETECTED`,
    csvCols: (n: number) => `${n} COLUMN${n === 1 ? "" : "S"}`,
    csvFile: "FILE",
    csvFieldCol: "SYSTEM FIELD",
    csvMapCol: "CSV COLUMN",
    csvSkip: "— SKIP —",
    csvUnmapped: (n: number) => `${n} field${n === 1 ? "" : "s"} will be left empty`,
    csvPreview: "PREVIEW · FIRST 3 ROWS",
    csvPreviewAllMapped: "ALL MAPPED",
    csvImportRows: (n: number) => `IMPORT ${n} ROW${n === 1 ? "" : "S"}`,
    csvImporting: "IMPORTING…",
    csvOk: (n: number) => `${n} record${n === 1 ? "" : "s"} imported`,
    csvOkDesc: "From CSV — logged to the ledger.",
    csvErr: "CSV import failed",
    csvParseErr: "Could not read that file as CSV text.",
    csvEmptyErr: "That CSV has no data rows to import.",
  },

  auto: {
    zero: "AUTOMATIONS · 0",
    count: (n: number) => `AUTOMATIONS · ${n}`,
    simMode: "SIMULATION MODE",
    runsOk: (ok: number, total: number) => `${ok}/${total} RUNS OK · SIMULATED`,
    executing: "EXECUTING…",
    lastRun: (ago: string, ok: boolean, ms: number) =>
      `LAST RUN ${ago} · ${ok ? `${ms}ms OK` : "FAILED"}`,
    neverRun: "NEVER RUN",
    run: "RUN",
    running: "RUNNING",
    console: "EXECUTION CONSOLE",
    history: (n: number) => `RUN HISTORY · ${n}`,
    noWorkflowsT: "NO WORKFLOWS",
    noWorkflowsC: "This system's blueprint has no automations. Forge a richer system or edit its blueprint to add workflows.",
    footer: (name: string) =>
      `WORKFLOW RUNS ARE SIMULATED AGAINST LIVE SYSTEM DATA — WAKEEL PLANS REAL CONNECTORS FOR ${name.toUpperCase()} ON YOUR ROADMAP.`,
    toastOk: "Automation executed",
    toastOkDesc: (ms: number) => `${ms}ms · logged to the ledger.`,
    toastFail: "Automation run failed",
    toastFailDesc: "Upstream timeout — no data was affected. Check the log.",
    toastErr: "Could not run automation",
    logLabel: "Automation execution log",
    exitCode: (failure: string) => `EXIT CODE 1 · ${failure}`,
    lab: "AUTOMATION LAB",
    suggest: "SUGGEST · WAKEEL",
    suggesting: "WAKEEL IS STUDYING THE SYSTEM…",
    proposals: (n: number) => `WAKEEL PROPOSES · ${n}`,
    proposedTag: "PROPOSED",
    whenLabel: "WHEN",
    thenLabel: "DO",
    whyLabel: "WHY",
    wire: "WIRE IT",
    wiring: "WIRING…",
    dismiss: "Dismiss proposal",
    wireOk: "Automation wired",
    wireOkDesc: "Added to the blueprint and logged to the ledger.",
    wireErr: "Could not wire automation",
    suggestErr: "Wakeel could not propose right now — try again in a moment.",
    labHint:
      "PROPOSALS ARE GROUNDED IN THIS SYSTEM'S BLUEPRINT AND LIVE RECORDS. WIRING ONE ADDS IT TO THE BLUEPRINT PERMANENTLY.",
  },

  ana: {
    label: "ANALYTICS",
    total: "TOTAL RECORDS",
    written7: "WRITTEN · 7D",
    vs7: "7D VS PRIOR",
    oldest: "OLDEST RECORD",
    writeVol: "WRITE VOLUME · LAST 30 DAYS",
    peak: (n: number) => `PEAK ${n}/DAY`,
    fieldCompletion: "FIELD COMPLETION",
    distribution: (label: string) => `DISTRIBUTION · ${label.toUpperCase()}`,
    values: (n: number) => `${n} VALUE${n === 1 ? "" : "S"}`,
    notEnoughT: "NOT ENOUGH DATA",
    notEnoughC: (name: string) =>
      `Analytics come alive once ${name} has records. Add a few from the RECORDS tab.`,
    chartAria: "Records created per day over the last 30 days",
    chartTip: (label: string, n: number) => `${label} · ${n} record${n === 1 ? "" : "s"}`,
    day: "D",
  },

  dock: {
    titleA: "WAKEEL",
    titleB: "AGENT DOCK",
    onDuty: "ON DUTY",
    clockedIn: "WAKEEL CLOCKED IN",
    emptyCopy: "Ask about your systems, records or next automation. It answers with full workspace context.",
    sugg1: "What systems do I have?",
    sugg2: "Suggest an automation for my CRM",
    sugg3: (name: string) => `How many records are in ${name}?`,
    insightEmpty: (name: string) => `Seed realistic sample data into “${name}”`,
    insightStale: (name: string) => `Draft a status digest for “${name}”`,
    insightRich: (name: string) => `Give me a pulse on ${name} — totals, recent writes, anything odd.`,
    insightCold: "No systems yet — give me your company URL and I’ll map your stack.",
    digestTag: "PROACTIVE REPORT",
    digestOk: "Status digest ready",
    digestOkDesc: "Wakeel posted the report into your conversation.",
    digestErr: "Digest failed",
    placeholder: "Message Wakeel…",
    composerLabel: "Message Wakeel",
    send: "Send message",
    operator: "OPERATOR",
    wakeel: "WAKEEL",
    sending: "OPERATOR · SENDING…",
    toastErr: "Wakeel is unreachable",
    logLabel: "Agent conversation",
  },

  share: {
    // owner-side panel
    button: "SHARE",
    panelTitle: "SHARE THIS SYSTEM",
    panelDesc:
      "Issue a secret read-only link. Anyone who has it can inspect this system — schema, live records, pulse — without signing in.",
    issue: "ISSUE READ-ONLY LINK",
    issuing: "ISSUING…",
    linkLabel: "READ-ONLY LINK",
    copy: "COPY",
    copied: "COPIED",
    revoke: "REVOKE",
    revoking: "REVOKING…",
    revokedNote: "Link revoked — that URL is now dead.",
    views: (n: number) => `${n} ${n === 1 ? "VIEW" : "VIEWS"}`,
    issuedLabel: "ISSUED",
    toastOk: "Read-only link issued",
    toastOkDesc: "Anyone with the link can now view this system.",
    toastRevokeOk: "Share link revoked",
    toastRevokeOkDesc: "The URL stops working immediately.",
    toastErr: "Share action failed",
    footerNote: "You can revoke the link at any time — access dies instantly.",
    qrLabel: "SCAN TO OPEN",
    qrHint: "Point any camera at the code — it opens this read-only view.",
    // public-side view
    pubEyebrow: "SHARED SYSTEM · READ-ONLY SNAPSHOT",
    pubBy: (w: string) => `SHARED BY THE ${w} WORKSPACE`,
    pubSchema: "SCHEMA",
    pubRecords: "LIVE RECORDS",
    pubWritten: "WRITTEN",
    pubAutomations: "AUTOMATIONS",
    pubPulse: "PULSE · LAST 14 DAYS",
    statFields: "TYPED FIELDS",
    statRecords: "RECORDS",
    statAutomations: "AUTOMATIONS",
    statSince: "ONLINE SINCE",
    loading: "FETCHING SNAPSHOT…",
    notFoundTitle: "LINK UNAVAILABLE",
    notFoundCopy:
      "This share link was revoked or never existed. Ask the operator for a fresh one — or hire your own Wakeel and share systems of your own.",
    notFoundArt: `[ ! ]  404
 ┌─────────────┐
 │  ██  LINK  ██  │
 │  DEAD END    │
 └─────────────┘`,
    pubCta: "HIRE YOUR OWN WAKEEL",
    pubFooter: "Assembled, run and shared by Wakeel — the AI employee that never clocks out.",
    backToSite: "wakeel.app",
  },

  palette: {
    searchPh: "Search systems, actions, activity…",
    noMatches: "NO MATCHES IN THE CONSOLE",
    views: "Views",
    openSystem: "Open system",
    agent: "Agent",
    openDock: "Open agent dock",
    recent: "Recent ledger",
    deck: "WAKEEL COMMAND DECK",
    footerStats: (systems: number, records: number) =>
      `${systems} systems · ${records} records`,
    vOverview: "Overview",
    vDiscovery: "Discovery — run a scan",
    vSystems: "Systems registry",
    vForge: "Forge a system",
    vActivity: "Activity ledger",
    tour: "Replay the guided tour",
  },

  lang: {
    toggleLabel: "Language",
    toggleToAr: "ع",
    toggleToEn: "EN",
  },
};

export type Dict = typeof en;

export const ar: Dict = {
  common: {
    cancel: "إلغاء",
    delete: "حذف",
    close: "إغلاق",
    clear: "مسح",
    save: "حفظ",
    loading: "جارٍ التحميل…",
    per: "·",
    skip: "تخطَّ إلى المحتوى الرئيسي",
  },

  nav: {
    capabilities: "القدرات",
    protocol: "البروتوكول",
    console: "الكونسول",
    enter: "ادخل الكونسول",
  },

  hero: {
    eyebrow: "وكيل — موظف ذكاء اصطناعي تشغيلي",
    titleA: "وظِّف موظفاً",
    titleB: "لا ينتهي دوامه أبداً.",
    sub: "واكيل يكتشف الأنظمة التي تديرها شركتك بالفعل — CRM وتخطيط الموارد والتخزين والمالية — ثم يبني ما ينقصك عند الطلب. توظيف واحد، وعمليتك كلها تحت السيطرة.",
    ctaPrimary: "وظِّف وكيلك",
    ctaSecondary: "استكشف الكونسول",
    statTasks: "مهمة منفَّذة / ساعة",
    statSystems: "نظام مرصود",
    statResponse: "متوسط الاستجابة",
    statUptime: "الجاهزية",
    chip1: "12 نظاماً مرصوداً",
    chip2: "مسح جارٍ",
    chip3: "جاهزية 99.98%",
  },

  ticker: {
    items: [
      "اكتمل المسح — 4 أنظمة مرصودة لـ NOVA RETAIL",
      "تم بناء «INVENTORY PRO» — 6 حقول و3 شاشات",
      "تم تبنّي «SAGE ERP» — ثقة 94%",
      "سجل #4821 أُضيف إلى «CLIENT ONBOARDING»",
      "أتمتة جديدة — تنبيه نقص المخزون ← بريد إلكتروني",
      "المشغّلة ليلي فعّالت مساحة عمل «NOVA»",
      "اكتمل المسح — 7 أنظمة مرصودة لـ ATLAS LOGISTICS",
      "تم بناء «LEAVE TRACKER» — 4 حقول وأتمتان",
    ],
  },

  protocol: {
    eyebrow: "البروتوكول",
    titleA: "ثلاث خطوات حتى",
    titleB: " أول توظيف ذكي.",
    copy: "بدون مكالمات بيع، وبدون سنة تنفيذ. وكيل يعمل مثل موظف حقيقي — يتعلم عمليتك أولاً، ثم يبدأ العمل.",
    s1t: "التسجيل",
    s1c: "سجّل ملف المشغّل واختر اسماً لمساحة عملك. يستيقظ وكيل وهو يعرف من أنت وما الذي تديره — بلا تكاملات معقدة وبلا أوراق.",
    s2t: "الاستكشاف",
    s2c: "وجّه وكيلًا إلى رابط شركتك أو صِف منظومتك. بحث حقيقي على الويب يرصد كل نظام تديره — CRM وتخطيط الموارد والتخزين والمالية — مع درجات ثقة.",
    s3t: "البناء",
    s3c: "صِف أي نظام تحتاجه بلغة بشرية. يبني وكيل تطبيقاً مصغّراً عامل التشغيل — كيانات وحقول مطبوعة وأتمتات — يتجسّد مباشرة في مساحة عملك.",
  },

  caps: {
    eyebrow: "القدرات",
    titleA: "موظف بعتادٍ",
    titleB: " كامل.",
    copy: "ست قدرات تشغيلية في كونسول واحد. وكيل ليس روبوت محادثة بإضافات — وكيل طاقم عمل.",
    c1t: "اكتشاف الأنظمة",
    c1c: "بحث حقيقي على الويب موجَّه إلى رابط شركتك يرصد كل نظام تديره — مع التصنيف والقدرات ودرجة الثقة.",
    c2t: "بناء الأنظمة",
    c2c: "صِف أي أداة تحتاجها بلغة بشرية. يبني وكيل نظاماً عاملاً بكيانات وحقول مطبوعة وأتمتات في مرور واحد.",
    c3t: "رصيف الوكيل",
    c3c: "حاور موظفك. إنه يعرف أنظمتك وسجلاتك وكل ما جرى في السجل هذا الأسبوع — ويرد بشخصيته المهنية.",
    c4t: "سجلات منظمة",
    c4c: "كل نظام يُبنى هو تطبيق حقيقي مصغّر: حقول مطبوعة وسجلات CRUD محفوظة في مساحتك. ليس نموذجاً — برمجيات فعلية.",
    c5t: "سجل العمليات",
    c5c: "كل مسح وبناء وتبنٍّ وتعديل يُدوَّن في سجل عمليات مركزي. لا شيء يفعله موظفك الذكي يمر في الظلام.",
    c6t: "عزل بالتصميم",
    c6c: "مساحات عمل لكل مشغّل. أنظمتك وسجلاتك وأثرك — لا شيء يُشارَك بين المشغّلين، ولا شيء يتسرب.",
  },

  preview: {
    eyebrow: "الكونسول",
    titleA: "غرفة عمليات",
    titleB: " لعملك بأكمله.",
    copy: "استكشاف وأنظمة مبنية وسجلات ودفتر عمليات حي — مع موظفك الذكي على بُعد ضغطة زر في رصيف الوكيل.",
    systemsMap: "خريطة الأنظمة",
    fourActive: "4 نشطة",
    thSystem: "النظام",
    thOrigin: "المصدر",
    thHealth: "الصحة",
    agentDock: "رصيف الوكيل",
    onDuty: "في الخدمة",
    operator: "المشغّل",
    wakeel: "وكيل",
    msgPlaceholder: "راسل واكيل…",
    chatA1: "انتهى جرد نقص المخزون. 3 أصناف تحت الحد في Inventory Pro — أُعدّ أوامر الشراء؟",
    chatU1: "نعم، وأبلغ قناة المستودع عند الإرسال.",
    chatA2: "أُعدّت 3 أوامر شراء. وُصّلت الأتمتة: تنبيه ← قناة المستودع. وسُجّلت في الدفتر.",
  },

  cta: {
    eyebrow: "الرسالة الأخيرة",
    titleA: "عملياتك تستحق ",
    titleB: "محترفاً.",
    copy: "ثلاثون ثانية من التسجيل، وملف مشغّل واحد. يبدأ واكيل مسح الاستكشاف لحظة بصمه الدخول.",
    button: "وظِّف وكيلك",
  },

  footer: {
    tagline: "موظفك الذكي — شغال معاك.",
    blurb: "موظف الذكاء الاصطناعي الذي توظّقه فعلاً. يكتشف أنظمتك، ويبني الناقص، ولا ينتهي دوامه أبداً.",
    product: "المنتج",
    protocolCol: "البروتوكول",
    status: "الحالة",
    allSystems: "كل الأنظمة تعمل",
    uptime: "الجاهزية · 99.98%",
    meanResp: "متوسط الاستجابة · 0.4 ث",
    lastSweep: "آخر مسح · قبل دقيقتين",
    rights: "© 2025 وكيل سيستمز. جميع الحقوق محفوظة.",
    builtFor: "صُنع للمشغّلين · و",
    lCapabilities: "القدرات",
    lConsole: "الكونسول",
    lAgentDock: "رصيف الوكيل",
    lOnboard: "التسجيل",
    lDiscover: "الاستكشاف",
    lForge: "البناء",
  },

  onb: {
    badge: "● تسجيل مشغّل جديد",
    title: "فعِّل وكيلك",
    desc: "سجّل ملف مشغّل. كل شيء — الأنظمة والسجلات والنشاط — محصور في مساحتك أنت.",
    fullName: "الاسم الكامل *",
    namePh: "مثال: ليلى حسن",
    workspace: "اسم مساحة العمل *",
    wsPh: "مثال: نوفا ريتيل",
    role: "الدور",
    rolePh: "اختر الدور (اختياري)",
    roles: ["مؤسِّس", "عمليات", "هندسة", "إدارة", "أخرى"],
    activate: "تفعيل الوكيل",
    activating: "جارٍ التفعيل…",
    storedNote: "يُحفظ محلياً · wakeel:user · بلا بريد إلكتروني",
    errName: "الاسم الكامل مطلوب.",
    errShort: "هذا الاسم قصير جداً.",
    errWs: "اسم مساحة العمل مطلوب.",
    toastOk: "تم تفعيل المشغّل",
    toastOkDesc: (name: string) => `أهلاً بك ${name} — كونسولك أصبح جاهزاً.`,
    toastErr: "فشل التفعيل",
    or: "— أو —",
    importCta: "لديك ملف مساحة عمل؟ استورده بدلاً من ذلك",
    importing: "جارٍ الاستيراد…",
  },

  boot: {
    booting: "واكيل // إقلاع",
    title: "WAKEEL OPS DECK",
    sub: "جارٍ تهيئة الكونسول",
    lines: [
      "المصادقة … تم قبول المشغّل",
      "ناقل الأنظمة … متصل",
      "ربط الوكيل … مصافحة ناجحة",
      "الدفتر … تمت المزامنة",
    ],
    ready: "الكونسول جاهز",
    skip: "اضغط أي مفتاح للتخطي",
  },

  sb: {
    search: "بحث",
    agentDock: "رصيف الوكيل",
    systems: "أنظمة",
    operational: "تشغيلي",
    operatorMenu: "قائمة المشغّل",
    switchOp: "تبديل المشغّل",
    switchedTitle: "تم تبديل المشغّل",
    switchedDesc: "مُسحت الهوية المحلية — عودة إلى منصة الهبوط.",
    fallbackWorkspace: "واكيل",
    fallbackName: "مشغّل",
    openPalette: "افتح لوحة الأوامر",
    exportOp: "تصدير مساحة العمل",
    exportTitle: "صُدّرت مساحة العمل",
    exportDesc: (s: number, r: number) => `${s} ${s === 1 ? "نظام" : "أنظمة"} · ${r} ${r === 1 ? "سجل" : "سجلات"} · حُفظ ملف JSON على جهازك.`,
    exportErr: "فشل التصدير",
    importOp: "استيراد مساحة العمل",
    importTitle: "استُوردت مساحة العمل",
    importDesc: (s: number, r: number) =>
      `استُعيد ${s} ${s === 1 ? "نظام" : "أنظمة"} · ${r} ${r === 1 ? "سجل" : "سجلات"} في مساحة عمل مشغّل جديدة.`,
    importInvalid: "هذا الملف ليس ملف تصدير مساحة عمل واكيل (wakeel.workspace/v1).",
    importErr: "فشل الاستيراد",
    workspaceSection: "بيانات المساحة",
    replayTour: "إعادة الجولة الإرشادية",
  },

  tour: {
    aria: "الجولة الإرشادية",
    skip: "تخطَّ الجولة",
    back: "السابق",
    next: "التالي",
    finish: "إنهاء",
    stepOf: (i: number, n: number) =>
      `محطة ${String(i).padStart(2, "0")} / ${String(n).padStart(2, "0")}`,
    dots: "تقدّم الجولة",
    doneTitle: "اكتملت الجولة",
    doneDesc: "الوكيل في الخدمة. اضغط ⌘K في أي وقت لتجد طريقك.",
    steps: [
      {
        kicker: "نظرة عامة",
        title: "لوحتك الصباحية",
        body: "المؤشرات، أحدث أنظمتك، وأحدث بنود السجل — مع أزرار فورية لتشغيل فحص استكشاف أو بناء نظام جديد.",
      },
      {
        kicker: "الاستكشاف",
        title: "ارسم خريطة ما تعمل به فعلًا",
        body: "وجّه وكيلك إلى رابط شركتك أو صِف منظومتك؛ يبحث في الويب الحي ويرصد كل نظام تستخدمه بالفعل — إدارة علاقات، تخطيط موارد، تخزين، مالية.",
      },
      {
        kicker: "الأنظمة",
        title: "كل شيء يسكن هنا",
        body: "كل نظام مكتشَف أو مبنيّ. افتح أحدها لترى السجلات والأتمتة والتحليلات واستيراد CSV وروابط المشاركة للقراءة فقط.",
      },
      {
        kicker: "الورشة",
        title: "ينقصك أداة؟ اطلبها بجملة",
        body: "صِف أي نظام بجملة واحدة — «نظام مخزون لصيدليتي» — وسيبني وكيلك تطبيقًا مصغّرًا حقيقيًا يعمل بحقول محددة النوع وواجهات جاهزة.",
      },
      {
        kicker: "النشاط",
        title: "سجلّ العمليات",
        body: "كل فحص وسجل وأتمتة ومحادثة موثّقة كسجل تدقيق. موظفك مسؤول أمامك دائمًا.",
      },
      {
        kicker: "رصيف الوكيل",
        title: "موظفك في الخدمة",
        body: "اسأل عن أنظمتك أو سجلاتك أو الأتمتة القادمة؛ يجيب وكيلك بسياق مساحة عملك الحي — مع اقتراحات جاهزة للبدء.",
      },
      {
        kicker: "الاختصارات",
        title: "تحرك بسرعة المشغّلين",
        body: "⌘K يفتح لوحة الأوامر، ومفاتيح 1–5 تنقلك مباشرة بين الشاشات. هذا كل شيء — الوكيل في الخدمة.",
      },
    ],
  },

  impv: {
    eyebrow: "فحص ما قبل الإقلاع",
    title: "استيراد مساحة العمل هذه؟",
    desc: "تفقّد ما سيستعيده هذا الملف قبل أن يلمس كونسولك. التأكيد ينشئ مساحة عمل مشغّل جديدة من الملف.",
    statSystems: "أنظمة",
    statRecords: "سجلات",
    exported: "صُدّر",
    forged: "مبني",
    discovered: "مُكتشف",
    recShort: "سجل",
    collisions: (n: number) =>
      n === 1
        ? "اسم واحد موجود أيضاً في مساحتك الحالية — وستبقى النسختان مستقلتين:"
        : `${n} أسماء موجودة أيضاً في مساحتك الحالية — وستبقى النسخ مستقلة:`,
    noCollisions: "لا تعارض أسماء مع مساحة عملك الحالية.",
    note: "يُستعاد الملف في مشغّل جديد تماماً — ستتحول جلستك الحالية إليه. لا يتم دمج أي شيء.",
    cancel: "إلغاء",
    confirm: "استيراد مساحة العمل",
    importing: "جارٍ الاستيراد…",
  },

  side: {
    overview: "نظرة عامة",
    discovery: "الاستكشاف",
    systems: "الأنظمة",
    forge: "البناء",
    activity: "النشاط",
    version: "واكيل v0.1 · و",
    navLabel: "تنقل الكونسول",
    hintKeys: "اضغط 1–5 لتبديل الشاشات",
  },

  ov: {
    consoleTag: "كونسول المشغّل",
    greetNight: "سهرٌ مع الفجر",
    greetMorning: "صباح الخير",
    greetAfternoon: "مساء الخير",
    greetEvening: "طاب مساؤك",
    operatorFallback: "مشغّل",
    subEmpty: "واكيل في الخدمة. ابدأ بمسح استكشاف أو ابنِ أول نظام لك.",
    subWith: (systems: number, records: number, ws: string) =>
      // \u200F (RLM) keeps a trailing period on the RTL side when the
      // workspace name is Latin — otherwise it latches onto the Latin run.
      `واكيل يراقب ${systems} ${systems === 1 ? "نظاماً" : "أنظمة"} و${records} ${records === 1 ? "سجلاً" : "سجلات"} في ${ws}\u200F.`,
    wsFallback: "مساحة عملك",
    statSystems: "الأنظمة",
    statRecords: "السجلات",
    statScans: "المسوحات",
    statActions: "إجراءات مسجلة",
    runDiscovery: "ابدأ استكشافاً",
    forgeNew: "ابنِ نظاماً جديداً",
    latest: "الأنظمة · الأحدث",
    allSystems: "كل الأنظمة",
    noSystemsT: "لا أنظمة بعد",
    noSystemsC: "شغّل مسح استكشاف لرصد ما تستخدمه فعلاً، أو ابنِ نظاماً جديداً من جملة واحدة.",
    runDiscoverySm: "استكشاف",
    forgeSm: "بناء",
    recentActivity: "النشاط الأخير",
    fullLedger: "الدفتر الكامل",
    ledgerEmpty: "— السجل فارغ —",
    rec: "سجل",
    recentSystemsLabel: "الأنظمة الأخيرة",
    recentActivityLabel: "النشاط الأخير",
  },

  disc: {
    eyebrow: "استطلاع",
    title: "اكتشاف الأنظمة",
    sub: "وجّه وكيلًا إلى رابط شركة أو اسمها. يدير بحثاً حقيقياً على الويب ويرصد كل نظام يستطيع كشفه — ثم يُدرجها في مساحة عملك.",
    target: "الهدف *",
    targetPh: "acme.com أو شركة أكمل",
    notes: "ملاحظات للمسح",
    notesPh: "أي شيء يجب أن يعرفه واكيل — القطاع، أدوات تشك فيها، المنطقة…",
    runScan: "شغّل مسح الاستكشاف",
    scanning: "جارٍ المسح…",
    errTarget: "الهدف مطلوب — رابط أو اسم شركة.",
    errTitle: "⚠ خطأ في المسح",
    stage1: "تحديد الهدف…",
    stage2: "استعلام الويب العام…",
    stage3: "استخلاص الإشارات…",
    stage4: "تصنيف الأنظمة…",
    stage5: "حساب درجات الثقة…",
    health: "الصحة",
    noScansT: "لا مسوحات مسجلة",
    noScansC: "شغّل أول مسح استكشاف — سيرصد واكيل المنظومة التي تديرها بالفعل ويشير إلى ما يمكنه تبنّيه.",
    history: "سجل المسوحات",
    found: "نتيجة",
    clear: "مسح",
    historyLabel: "سجل المسوحات",
    resultsLabel: "أحدث نتائج المسح",
    fallbackSummary: (n: number, target: string) => `رُصد ${n} نظام لـ ${target}\u200F.`,
    toastOk: "اكتمل المسح",
    toastOkDesc: (n: number, target: string) => `رُصد ${n} نظام لـ ${target}\u200F.`,
    toastErr: "فشل المسح",
  },

  sys: {
    eyebrow: "السجل",
    title: "الأنظمة",
    loading: "جارٍ تحميل سجلّك…",
    statsLine: (n: number, active: number) =>
      `${n} ${n === 1 ? "نظام" : "أنظمة"} · ${active} نشط · مكتشفة ومبنية بواسطة واكيل.`,
    emptyT: "السجل فارغ",
    emptyC: "لا شيء في مساحة عملك بعد. شغّل مسح استكشاف لتبنّي أنظمة قائمة، أو ابنِ نظاماً جديداً من جملة واحدة.",
    runDiscovery: "استكشاف",
    forgeSystem: "بناء نظام",
    kbdNav: "تنقّل",
    kbdOpen: "فتح",
    records: (n: number) => `${n} ${n === 1 ? "سجل" : "سجلات"}`,
    capabilities: (n: number) => `${n} قدرات`,
    archived: "مؤرشف",
  },

  forge: {
    eyebrow: "تصنيع",
    title: "ورشة بناء الأنظمة",
    sub: "صِف أي نظام تحتاجه في جملة واحدة. يصمم واكيل الكيانات ويوصل الأتمتات ويسلّم نظاماً عامل التشغيل — بسجلات نموذجية — مباشرة إلى سجلّك.",
    brief: "وصف النظام *",
    briefPh: "مثال: نظام مخزون لصيدليتي مع تشغيلات وتنبيهات انتهاء صلاحية وموردين…",
    ex1: "نظام مخزون صيدلية",
    ex2: "متابعة تأهيل العملاء",
    ex3: "إدارة إجازات الموظفين",
    ex4: "سجل شحنات المستودع",
    examplesLabel: "أمثلة جاهزة",
    forgeBtn: "ابنِ النظام",
    forging: "جارٍ البناء…",
    errBrief: "صِف النظام ببضع كلمات على الأقل.",
    errTitle: "⚠ خطأ في البناء",
    stage1: "تحليل المتطلبات…",
    stage2: "تصميم الكيانات…",
    stage3: "توصيل الأتمتات…",
    stage4: "تجسيد النظام…",
    entityFields: (n: number) => `الكيان · ${n} حقول`,
    sampleRecords: "سجلات نموذجية",
    automations: "الأتمتات",
    openSystem: "افتح النظام",
    recent: "أحدث ما بُني",
    coldT: "الورشة باردة",
    coldC: "لا أنظمة مبنية بعد. اكتب وصفاً بالأعلى وسيصنع واكيل أول نظام لك في ثوانٍ.",
    recentLabel: "أحدث ما بُني",
    resultLabel: "نتيجة البناء",
    rec: "سجل",
    toastOk: "تم بناء النظام",
    toastOkDesc: (name: string) => `${name} أصبح حياً في سجلّك.`,
    toastErr: "فشل البناء",
  },

  act: {
    eyebrow: "الدفتر",
    title: "النشاط",
    sub: "كل إجراء يتخذه واكيل نيابةً عنك — بطابع زمني، بلا شيء مخفي.",
    live: "حي · تحديث كل 15ث",
    all: "الكل",
    filters: {
      SCAN: "مسح",
      FORGE: "بناء",
      RECORD: "سجل",
      AUTOMATION: "أتمتة",
      CHAT: "محادثة",
      STATUS: "حالة",
      DELETE: "حذف",
      SHARE: "مشاركة",
      IMPORT: "استيراد",
    },
    emptyT: "السجل فارغ",
    emptyC: "بمجرد أن تشغّل مسحاً أو تبني نظاماً أو تحاور واكيل، كل إجراء سيهبط هنا.",
    noEventsT: (t: string) => `لا أحداث ${t}`,
    noEventsC: "لا أحداث من هذا النوع بعد — بدّل المرشح أو اصنع شيئاً يستحق التسجيل.",
    filterLabel: "تصفية حسب النوع",
  },

  detail: {
    tabOverview: "نظرة عامة",
    tabRecords: "السجلات",
    tabAutomations: "الأتمتة",
    tabAnalytics: "التحليلات",
    tablistLabel: "أقسام تفاصيل النظام",
    pulse: "النبض · آخر 14 يوماً",
    recordsStat: "السجلات",
    lastWrite: "آخر كتابة",
    typedFields: "حقول مطبوعة",
    blueprint: "المخطط · حقول الكيان",
    noFields: "لم تُحدَّد حقول مطبوعة لهذا النظام.",
    automations: "الأتمتات",
    moreAuto: (n: number) => `+${n} المزيد · افتح الأتمتات ←`,
    danger: "منطقة الخطر",
    restore: "استعادة النظام",
    archive: "أرشفة النظام",
    delete: "حذف النظام",
    created: "أُنشئ",
    delTitle: "تحذف هذا النظام؟",
    delDesc: (name?: string) =>
      `${name ?? "هذا النظام"} وكل سجلاته ستُحذف نهائياً. لا يمكن التراجع عن هذا الإجراء.`,
    toastArchived: "أُرشف النظام",
    toastRestored: "استُعيد النظام",
    toastUpdErr: "فشل التحديث",
    toastDelOk: "حُذف النظام",
    toastDelDesc: "حُذف هو وكل سجلاته. وسُجّل في الدفتر.",
    toastDelErr: "فشل الحذف",
    loadingTitle: "جارٍ تحميل النظام",
    unavailTitle: "النظام غير متاح",
    unavailFallback: "تعذر تحميل هذا النظام.",
    pulseAria: "السجلات المضافة يومياً، آخر 14 يوماً",
    pulseTip: (day: string, n: number) => `${day} · ${n} ${n === 1 ? "سجل" : "سجلات"}`,
    d14: "قبل 14 يوم",
    today: "اليوم",
  },

  recs: {
    header: (n: number) => `السجلات · ${n}`,
    add: "إضافة سجل",
    cancel: "إلغاء",
    editing: "تحرير سجل",
    saveChanges: "حفظ التغييرات",
    discard: "تجاهل",
    saveRecord: "حفظ السجل",
    saving: "جارٍ الحفظ…",
    noFields: "لا توجد حقول مخططة لهذا النظام — ستكون السجلات كائنات فارغة.",
    noRecordsT: "لا سجلات بعد",
    noRecordsC: "أضف أول سجل لتبدأ بملء هذا النظام.",
    selected: (n: number) => `${n} محدد`,
    export: "تصدير",
    clearSel: "مسح",
    deleteSel: "حذف",
    selectAll: "تحديد كل السجلات",
    selectOne: (v: string) => `تحديد السجل ${v}`,
    recActions: "إجراءات السجل",
    edit: "تحرير",
    kbdNav: "تنقّل",
    kbdSelect: "تحديد",
    kbdEdit: "تحرير",
    kbdClear: "إلغاء",
    delBulkTitle: (n: number) => `تحذف ${n} ${n === 1 ? "سجلاً" : "سجلات"}؟`,
    delBulkDesc: (name: string) =>
      `ستُحذف السجلات المحددة نهائياً من ${name}\u200F. لا يمكن التراجع عن هذا الإجراء.`,
    toastAddOk: "أُضيف السجل",
    toastAddDesc: "سُجل في الدفتر وحُفظ في نظامك.",
    toastAddErr: "تعذرت إضافة السجل",
    toastDelOk: "حُذف السجل",
    toastDelDesc: "أُزيل من النظام.",
    toastDelErr: "فشل الحذف",
    toastUpdOk: "حُدِّث السجل",
    toastUpdDesc: "حُفظت التغييرات وسُجلت في الدفتر.",
    toastUpdErr: "فشل التحديث",
    toastBulkOk: (n: number) => `حُذف ${n} ${n === 1 ? "سجل" : "سجلات"}`,
    toastBulkDesc: "سُجلت الإزالة الجماعية في الدفتر.",
    toastBulkErr: "فشل الحذف الجماعي",
    true: "نعم",
    false: "لا",
    selectField: (label: string) => `اختر ${label}`,
    seed: "زرع بيانات تجريبية",
    seeding: "جارٍ الزرع…",
    seedOk: "نَمَت البيانات التجريبية",
    seedOkDesc: (n: number) =>
      `أضاف واكيل ${n} ${n === 1 ? "سجلاً واقعياً" : "سجلات واقعية"} — سُجلت في الدفتر.`,
    seedErr: "فشلت الزراعة",
    csvImport: "استيراد CSV",
    csvNoFields: "لا حقول مخططة للربط",
    csvTitle: "ربط أعمدة CSV",
    csvDesc:
      "طابق كل حقل من حقول النظام مع عمود من ملفك. تُحوَّل القيم إلى نوع الحقل عند الاستيراد — وتُعاين الصفوف قبل كتابة أي شيء.",
    csvRows: (n: number) => `رُصد ${n} ${n === 1 ? "صف" : "صفوف"}`,
    csvCols: (n: number) => `${n} ${n === 1 ? "عمود" : "أعمدة"}`,
    csvFile: "الملف",
    csvFieldCol: "حقل النظام",
    csvMapCol: "عمود CSV",
    csvSkip: "— تخطٍ —",
    csvUnmapped: (n: number) => `${n} ${n === 1 ? "حقل سيُترك فارغاً" : "حقول ستُترك فارغة"}`,
    csvPreview: "معاينة · أول 3 صفوف",
    csvPreviewAllMapped: "الكل مطابق",
    csvImportRows: (n: number) => `استورد ${n} ${n === 1 ? "صفاً" : "صفوف"}`,
    csvImporting: "جارٍ الاستيراد…",
    csvOk: (n: number) => `استُورد ${n} ${n === 1 ? "سجل" : "سجلات"}`,
    csvOkDesc: "من ملف CSV — سُجلت في الدفتر.",
    csvErr: "فشل استيراد CSV",
    csvParseErr: "تعذرت قراءة الملف كنص CSV.",
    csvEmptyErr: "لا تحتوي هذه الملفات على صفوف بيانات للاستيراد.",
  },

  auto: {
    zero: "الأتمتات · 0",
    count: (n: number) => `الأتمتات · ${n}`,
    simMode: "وضع المحاكاة",
    runsOk: (ok: number, total: number) => `${ok}/${total} تشغيل ناجح · محاكاة`,
    executing: "جارٍ التنفيذ…",
    lastRun: (ago: string, ok: boolean, ms: number) =>
      `آخر تشغيل ${ago} · ${ok ? `${ms}ms ناجح` : "فشل"}`,
    neverRun: "لم يُشغَّل بعد",
    run: "تشغيل",
    running: "يعمل",
    console: "كونسول التنفيذ",
    history: (n: number) => `سجل التشغيلات · ${n}`,
    noWorkflowsT: "لا مهام عمل",
    noWorkflowsC: "مخطط هذا النظام لا يحتوي أتمتات. ابنِ نظاماً أغنى أو عدّل مخططه لإضافة مهام عمل.",
    footer: (name: string) =>
      `تُحاكى تشغيلات المهام مقابل بيانات النظام الحية — يخطط واكيل لموصلات حقيقية لـ ${name} على خارطة طريقك.`,
    toastOk: "نُفذت الأتمتة",
    toastOkDesc: (ms: number) => `${ms}ms · سُجلت في الدفتر.`,
    toastFail: "فشل تشغيل الأتمتة",
    toastFailDesc: "انتهت مهلة المنبع — لم تتأثر أي بيانات. راجع السجل.",
    toastErr: "تعذر تشغيل الأتمتة",
    logLabel: "سجل تنفيذ الأتمتة",
    exitCode: (failure: string) => `رمز الخروج 1 · ${failure}`,
    lab: "مختبر الأتمتة",
    suggest: "اقترح · واكيل",
    suggesting: "واكيل يدرس النظام…",
    proposals: (n: number) => `واكيل يقترح · ${n}`,
    proposedTag: "مقترحة",
    whenLabel: "المحفّز",
    thenLabel: "الإجراء",
    whyLabel: "لماذا",
    wire: "اربطها",
    wiring: "جارٍ الربط…",
    dismiss: "تجاهل الاقتراح",
    wireOk: "رُبطت الأتمتة",
    wireOkDesc: "أُضيفت إلى المخطط وسُجلت في الدفتر.",
    wireErr: "تعذر ربط الأتمتة",
    suggestErr: "تعذر على واكيل الاقتراح الآن — أعد المحاولة بعد قليل.",
    labHint:
      "تُشتق الاقتراحات من مخطط هذا النظام وسجلاته الحية. ربط أحدها يضيفه إلى المخطط نهائياً.",
  },

  ana: {
    label: "التحليلات",
    total: "إجمالي السجلات",
    written7: "كُتبت · 7 أيام",
    vs7: "7 أيام مقابل سابقتها",
    oldest: "أقدم سجل",
    writeVol: "حجم الكتابة · آخر 30 يوماً",
    peak: (n: number) => `الذروة ${n}/يوم`,
    fieldCompletion: "اكتمال الحقول",
    distribution: (label: string) => `التوزيع · ${label}`,
    values: (n: number) => `${n} ${n === 1 ? "قيمة" : "قيم"}`,
    notEnoughT: "بيانات غير كافية",
    notEnoughC: (name: string) =>
      `تأتي التحليلات إلى الحياة عندما يمتلك ${name} سجلات. أضف بعضها من تبويب السجلات.`,
    chartAria: "السجلات المضافة يومياً خلال آخر 30 يوماً",
    chartTip: (label: string, n: number) => `${label} · ${n} ${n === 1 ? "سجل" : "سجلات"}`,
    day: "يوم",
  },

  dock: {
    titleA: "واكيل",
    titleB: "رصيف الوكيل",
    onDuty: "في الخدمة",
    clockedIn: "واكيل بصم الدخول",
    emptyCopy: "اسأل عن أنظمتك أو سجلاتك أو أتمتتك القادمة. يرد بسياق مساحة عملك الكامل.",
    sugg1: "ما الأنظمة التي أملكها؟",
    sugg2: "اقترح أتمتة لنظام العملاء عندي",
    sugg3: (name: string) => `كم سجلاً في ${name}؟`,
    insightEmpty: (name: string) => `ازرع بيانات تجريبية واقعية في «${name}»`,
    insightStale: (name: string) => `أعدّ ملخص حالة لـ «${name}»`,
    insightRich: (name: string) => `أعطني نبضة عن ${name} — الإجماليات وآخر الكتابات وأي شيء غريب.`,
    insightCold: "لا أنظمة بعد — أعطني رابط شركتك وسأرصد منظومتك.",
    digestTag: "تقرير استباقي",
    digestOk: "ملخص الحالة جاهز",
    digestOkDesc: "أرسل واكيل التقرير إلى محادثتك.",
    digestErr: "فشل إعداد الملخص",
    placeholder: "راسل واكيل…",
    composerLabel: "راسل واكيل",
    send: "إرسال الرسالة",
    operator: "المشغّل",
    wakeel: "وكيل",
    sending: "المشغّل · يُرسل…",
    toastErr: "واكيل خارج التغطية",
    logLabel: "محادثة الوكيل",
  },

  share: {
    // owner-side panel
    button: "مشاركة",
    panelTitle: "شارك هذا النظام",
    panelDesc:
      "أصدر رابط قراءة فقط سرياً. أي شخص يملكه يستطيع معاينة هذا النظام — البنية والسجلات الحية والنبض — دون تسجيل دخول.",
    issue: "إصدار رابط قراءة فقط",
    issuing: "جارٍ الإصدار…",
    linkLabel: "رابط القراءة فقط",
    copy: "نسخ",
    copied: "تم النسخ",
    revoke: "إبطال",
    revoking: "جارٍ الإبطال…",
    revokedNote: "أُبطل الرابط — عنوان URL لم يعد يعمل.",
    views: (n: number) => `${n} ${n === 1 ? "مشاهدة" : "مشاهدات"}`,
    issuedLabel: "صدر",
    toastOk: "تم إصدار رابط القراءة فقط",
    toastOkDesc: "أي شخص يملك الرابط يستطيع الآن معاينة النظام.",
    toastRevokeOk: "أُبطل رابط المشاركة",
    toastRevokeOkDesc: "توقف الرابط عن العمل فوراً.",
    toastErr: "فشلت عملية المشاركة",
    footerNote: "يمكنك إبطال الرابط في أي وقت — ينقطع الوصول فوراً.",
    qrLabel: "امسح للفتح",
    qrHint: "وجّه أي كاميرا نحو الرمز — سيفتح هذا العرض للقراءة فقط.",
    // public-side view
    pubEyebrow: "نظام مُشارك · لقطة قراءة فقط",
    pubBy: (w: string) => `مُشارَك من مساحة عمل ${w}`,
    pubSchema: "البنية",
    pubRecords: "السجلات الحية",
    pubWritten: "كُتب",
    pubAutomations: "الأتمتات",
    pubPulse: "النبض · آخر 14 يوماً",
    statFields: "حقول مُنمّطة",
    statRecords: "سجلات",
    statAutomations: "أتمتات",
    statSince: " يعمل منذ",
    loading: "جارٍ جلب اللقطة…",
    notFoundTitle: "الرابط غير متاح",
    notFoundCopy:
      "هذا الرابط أُبطل أو لم يكن موجوداً أصلاً. اطلب من المشغّل رابطاً جديداً — أو وظّف وكيلاً خاصاً بك وشارك أنظمتك بنفسك.",
    notFoundArt: `[ ! ]  404
 ┌─────────────┐
 │  ██  LINK  ██  │
 │  DEAD END    │
 └─────────────┘`,
    pubCta: "وظّف وكيلاً خاصاً بك",
    pubFooter: "يبنيه ويشغّله ويشاركه واكيل — الموظف الذكي الذي لا ينتهي دوامه.",
    backToSite: "wakeel.app",
  },

  palette: {
    searchPh: "ابحث في الأنظمة والإجراءات والنشاط…",
    noMatches: "لا مطابقات في الكونسول",
    views: "الشاشات",
    openSystem: "فتح نظام",
    agent: "الوكيل",
    openDock: "افتح رصيف الوكيل",
    recent: "أحدث الدفتر",
    deck: "لوحة أوامر واكيل",
    footerStats: (systems: number, records: number) =>
      `${systems} أنظمة · ${records} سجلات`,
    vOverview: "نظرة عامة",
    vDiscovery: "الاستكشاف — شغّل مسحاً",
    vSystems: "سجل الأنظمة",
    vForge: "ابنِ نظاماً",
    vActivity: "دفتر النشاط",
    tour: "أعد الجولة الإرشادية",
  },

  lang: {
    toggleLabel: "اللغة",
    toggleToAr: "ع",
    toggleToEn: "EN",
  },
};

const DICTS: Record<Lang, Dict> = { en, ar };

/**
 * Record-count label with correct pluralization.
 *  EN: 0 RECORDS / 1 RECORD / 5 RECORDS
 *  AR: 0 سجلات · 1 سجل · 2 سجلان · 3–10 سجلات · 11+ سجلاً
 */
export function recCount(n: number, lang: Lang): string {
  if (lang === "en") return `${n} RECORD${n === 1 ? "" : "S"}`;
  if (n === 0) return `${n} سجلات`;
  if (n === 1) return `${n} سجل`;
  if (n === 2) return `${n} سجلان`;
  if (n <= 10) return `${n} سجلات`;
  return `${n} سجلاً`;
}

/** Typed hook: returns the dictionary for the active language. */
export function useT(): Dict {
  const lang = useWakeel((s) => s.lang);
  return DICTS[lang];
}

export function dictFor(lang: Lang): Dict {
  return DICTS[lang];
}

/* --------------------------- activity localizer ---------------------------- */

/** A rendered title is a sequence of plain segments and isolated (bdi) names. */
export type ActivitySegment = string | { bdi: string };

export interface LocalizedActivity {
  titleParts: ActivitySegment[];
  detail: string | null;
}

/**
 * Server-side activity titles are stable English templates (see the
 * `activity.create` calls in the API routes). For Arabic we reverse them into
 * localized templates at render time — no schema change, and any unmatched
 * title (LLM-generated or future types) falls back to the raw string.
 * Latin names are returned as {bdi} segments so the renderer can isolate them.
 */
export function localizeActivity(
  a: { type: string; title: string; detail?: string | null },
  lang: Lang
): LocalizedActivity {
  if (lang !== "ar") return { titleParts: [a.title], detail: a.detail ?? null };

  const t = a.title;
  let parts: ActivitySegment[] | null = null;
  let detail: string | null = a.detail ?? null;

  // order matters: specific patterns before generic prefixes
  let m: RegExpMatchArray | null;
  if ((m = /^Bulk deleted (\d+) records? from (.+)$/.exec(t))) {
    const n = Number(m[1]);
    parts = [`حُذف ${n} ${n === 1 ? "سجل" : "سجلات"} من`, { bdi: m[2] }];
  } else if ((m = /^Seeded (\d+) sample records? into (.+)$/.exec(t))) {
    const n = Number(m[1]);
    parts = [
      `زُرع ${n} ${n === 1 ? "سجل تجريبي" : "سجلات تجريبية"} في`,
      { bdi: m[2] },
    ];
  } else if ((m = /^Wired new automation into (.+)$/.exec(t))) {
    parts = [`رُبطت أتمتة جديدة في`, { bdi: m[1] }];
  } else if ((m = /^Imported (\d+) records? into (.+) from CSV$/.exec(t))) {
    const n = Number(m[1]);
    parts = [
      `استُورد ${n} ${n === 1 ? "سجل" : "سجلات"} إلى`,
      { bdi: m[2] },
      ` من ملف CSV`,
    ];
  } else if ((m = /^Imported (\d+) systems? for (.+)$/.exec(t))) {
    const n = Number(m[1]);
    parts = [`استُورد ${n} ${n === 1 ? "نظام" : "أنظمة"} لـ`, { bdi: m[2] }];
  } else if ((m = /^Discovered (\d+) systems? for (.+)$/.exec(t))) {
    const n = Number(m[1]);
    parts = [`رُصد ${n} ${n === 1 ? "نظام" : "أنظمة"} لـ`, { bdi: m[2] }];
  } else if ((m = /^Automation failed on (.+)$/.exec(t))) {
    parts = [`فشلت الأتمتة على`, { bdi: m[1] }];
  } else if ((m = /^Automation ran on (.+)$/.exec(t))) {
    parts = [`شغّلت الأتمتة على`, { bdi: m[1] }];
  } else if ((m = /^Share link revoked for "(.+)"$/.exec(t))) {
    parts = [`سُحب رابط مشاركة "`, { bdi: m[1] }, `"`];
  } else if ((m = /^Shared "(.+)"$/.exec(t))) {
    parts = [`تمت مشاركة "`, { bdi: m[1] }, `"`];
  } else if ((m = /^New record added to (.+)$/.exec(t))) {
    parts = [`سجل جديد في`, { bdi: m[1] }];
  } else if ((m = /^Moved (.+) to DRAFT$/.exec(t))) {
    parts = [`نُقل`, { bdi: m[1] }, ` إلى DRAFT`];
  } else if ((m = /^Wakeel handled a request for (.+)$/.exec(t))) {
    parts = [`وكيل عالج طلباً لـ`, { bdi: m[1] }];
  } else if ((m = /^Wakeel delivered a status digest for (.+)$/.exec(t))) {
    parts = [`وكيل أعدّ ملخص حالة لـ`, { bdi: m[1] }];
  } else if ((m = /^Archived (.+)$/.exec(t))) {
    parts = [`أُرشف`, { bdi: m[1] }];
  } else if ((m = /^Restored (.+)$/.exec(t))) {
    parts = [`أُعيد تنشيط`, { bdi: m[1] }];
  } else if ((m = /^Deleted (.+)$/.exec(t))) {
    parts = [`حُذف`, { bdi: m[1] }];
  } else if ((m = /^Forged (.+)$/.exec(t))) {
    parts = [`بُني`, { bdi: m[1] }];
  } else if ((m = /^Updated (.+)$/.exec(t))) {
    parts = [`حُدّث`, { bdi: m[1] }];
  }

  if (detail) {
    let dm: RegExpMatchArray | null;
    if ((dm = /^Fields: (.+)$/.exec(detail))) {
      detail = `الحقول: ${dm[1].split(", ").join("، ")}`;
    } else if (/^Removed system and all of its records$/.test(detail)) {
      detail = "أُزيل النظام وكل سجلاته";
    } else if (/^Selection removed via records console$/.test(detail)) {
      detail = "أُزيل التحديد من كونسول السجلات";
    } else if ((dm = /^Read-only link issued · token (.+)$/.exec(detail))) {
      detail = `تم إصدار رابط قراءة فقط · الرمز ${dm[1]}`;
    } else if ((dm = /^Token (.+?)… can no longer be opened\.$/.exec(detail))) {
      detail = `الرمز ${dm[1]}… لم يعد يفتح.`;
    } else if (
      (dm = /^Restored from a workspace file · (\d+) systems? · (\d+) records?$/.exec(detail))
    ) {
      const s = Number(dm[1]);
      const r = Number(dm[2]);
      detail = `استُرجع من ملف مساحة عمل · ${s} ${s === 1 ? "نظام" : "أنظمة"} · ${r} ${r === 1 ? "سجل" : "سجلات"}`;
    } else if (
      (dm = /^(\d+) records? · last write (\d+)d ago$/.exec(detail))
    ) {
      const r = Number(dm[1]);
      const d = Number(dm[2]);
      detail = `${r} ${r === 1 ? "سجل" : "سجلات"} · آخر كتابة قبل ${d} ${d === 1 ? "يوم" : "أيام"}`;
    }
  }

  return { titleParts: parts ?? [t], detail };
}
