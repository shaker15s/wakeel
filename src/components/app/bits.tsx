"use client";

import {
  Activity,
  Banknote,
  Bot,
  Boxes,
  CalendarDays,
  ChartLine,
  ClipboardList,
  Contact,
  Database,
  FileText,
  Folder,
  Hammer,
  Headset,
  Hexagon,
  Mail,
  Package,
  Pill,
  Radar,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import type { ActivityType, Origin, SystemStatus } from "@/lib/api-client";

/* ------------------------------ icon mapping ------------------------------ */

const ICON_MAP: Record<string, LucideIcon> = {
  radar: Radar,
  database: Database,
  db: Database,
  hammer: Hammer,
  wrench: Wrench,
  bot: Bot,
  headset: Headset,
  activity: Activity,
  chart: ChartLine,
  analytics: ChartLine,
  shield: ShieldCheck,
  security: ShieldCheck,
  package: Package,
  inventory: Package,
  boxes: Boxes,
  box: Boxes,
  warehouse: Warehouse,
  pill: Pill,
  pharmacy: Pill,
  users: Users,
  crm: Contact,
  contact: Contact,
  calendar: CalendarDays,
  schedule: CalendarDays,
  truck: Truck,
  logistics: Truck,
  shipment: Truck,
  clipboard: ClipboardList,
  tasks: ClipboardList,
  banknote: Banknote,
  finance: Banknote,
  money: Banknote,
  mail: Mail,
  email: Mail,
  file: FileText,
  document: FileText,
  folder: Folder,
  storage: Folder,
};

/** Map a backend icon string to a lucide icon with a safe fallback. */
export function systemIcon(name?: string | null): LucideIcon {
  if (!name) return Hexagon;
  return ICON_MAP[name.trim().toLowerCase()] ?? Boxes;
}

/* --------------------------------- chips ---------------------------------- */

export function OriginBadge({
  origin,
  className,
}: {
  origin: Origin;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        origin === "DISCOVERED"
          ? "border border-gold/50 bg-gold/5 text-gold"
          : "bg-gold text-[#0A0908]",
        className
      )}
    >
      {origin}
    </span>
  );
}

const TYPE_COLORS: Record<string, string> = {
  SCAN: "text-live border-live/40 bg-live/10",
  FORGE: "text-gold border-gold/40 bg-gold/10",
  ADOPT: "text-gold-pale border-gold-pale/40 bg-gold-pale/10",
  RECORD: "text-foreground border-foreground/25 bg-foreground/5",
  CHAT: "text-muted-foreground border-muted-foreground/30 bg-muted-foreground/5",
  STATUS: "text-gold-deep border-gold-deep/40 bg-gold-deep/10",
  DELETE: "text-destructive border-destructive/40 bg-destructive/10",
  ARCHIVE: "text-muted-foreground border-muted-foreground/30 bg-muted-foreground/5",
  RESTORE: "text-live border-live/40 bg-live/10",
};

export function TypeChip({
  type,
  className,
}: {
  type: ActivityType | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        TYPE_COLORS[type] ?? "text-muted-foreground border-border bg-muted",
        className
      )}
    >
      {type}
    </span>
  );
}

export function StatusDot({
  status,
  className,
}: {
  status: SystemStatus | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        className
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "ACTIVE" && "bg-live shadow-[0_0_6px_rgba(62,207,142,0.8)]",
          status === "DRAFT" && "bg-gold",
          status === "ARCHIVED" && "bg-muted-foreground/50",
          status === "RUNNING" && "bg-gold animate-blink",
          status === "COMPLETE" && "bg-live",
          status === "FAILED" && "bg-destructive",
          status === "DONE" && "bg-live"
        )}
      />
    </span>
  );
}

export function CategoryChip({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
        className
      )}
    >
      {category}
    </span>
  );
}

/* ------------------------------ data viz bits ------------------------------ */

export function HealthBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped >= 70
      ? "bg-live"
      : clamped >= 40
        ? "bg-gold"
        : "bg-destructive";
  return (
    <div
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-foreground/10",
        className
      )}
      role="presentation"
    >
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** SVG circular progress in gold, used for scan confidence. */
export function ConfidenceRing({
  value,
  size = 44,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Confidence ${clamped}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(245,239,228,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E8B44A"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] tabular-nums text-gold">
        {clamped}%
      </span>
    </div>
  );
}

/** Deterministic decorative sparkline bars. */
export function SparkBars({
  seed = 1,
  bars = 12,
  className,
}: {
  seed?: number;
  bars?: number;
  className?: string;
}) {
  const heights = Array.from(
    { length: bars },
    (_, i) => ((seed * 37 + i * 29) % 55) + 18
  );
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-8 items-end gap-[3px] overflow-hidden",
        className
      )}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className={cn(
            "w-[3px] rounded-[1px]",
            i === heights.length - 1 ? "bg-gold" : "bg-gold/25"
          )}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------ empty states ------------------------------ */

export function EmptyState({
  art,
  title,
  copy,
  children,
  className,
}: {
  art?: string;
  title: string;
  copy?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center",
        className
      )}
    >
      {art && (
        <pre
          aria-hidden
          className="select-none font-mono text-[11px] leading-[1.5] text-gold/50"
        >
          {art}
        </pre>
      )}
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
        {title}
      </p>
      {copy && (
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {copy}
        </p>
      )}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

export function timeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return formatDistanceToNowStrict(d, { addSuffix: true });
  } catch {
    return "—";
  }
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
