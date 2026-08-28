"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Compass, Download, LogOut, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { WakeelMark } from "@/components/app/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsOf } from "@/components/app/bits";
import { LangToggle } from "@/components/app/lang-toggle";
import { ImportPreviewDialog } from "@/components/app/console/import-preview-dialog";
import {
  getSystems,
  getSystemDetail,
  getUser,
  parseBlueprint,
  parseCapabilities,
  parseRecordData,
} from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";
import { confirmImport, parseWorkspaceFile, type WorkspacePayload } from "@/lib/workspace-import";

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // schedule first paint asynchronously (setState inside a callback,
    // not synchronously in the effect body)
    const raf = requestAnimationFrame(() => setNow(new Date()));
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);
  return (
    <span className="font-mono text-[11px] tabular-nums tracking-[0.1em] text-muted-foreground" dir="ltr">
      {now
        ? now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "--:--:--"}
    </span>
  );
}

export function StatusBar() {
  const t = useT();
  const userId = useWakeel((s) => s.userId);
  const agentDockOpen = useWakeel((s) => s.agentDockOpen);
  const toggleAgentDock = useWakeel((s) => s.toggleAgentDock);
  const setPaletteOpen = useWakeel((s) => s.setPaletteOpen);
  const setTourOpen = useWakeel((s) => s.setTourOpen);
  const switchOperator = useWakeel((s) => s.switchOperator);
  const setUserId = useWakeel((s) => s.setUserId);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getUser(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  });
  const { data: systemsData } = useQuery({
    queryKey: ["systems", userId],
    queryFn: () => getSystems(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  });

  const user = data?.user;
  const systemCount = systemsData?.systems.length ?? 0;

  const handleSwitch = () => {
    try {
      window.localStorage.removeItem("wakeel:user");
    } catch {
      // ignore storage failures
    }
    switchOperator();
    toast(t.sb.switchedTitle, {
      description: t.sb.switchedDesc,
    });
  };

  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  /** parsed workspace file awaiting confirmation in the preview dialog */
  const [preview, setPreview] = useState<WorkspacePayload | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  /**
   * Import a `wakeel.workspace/v1` export file: parse client-side → PREVIEW
   * dialog (contents + collisions) → server-side re-validation + restore
   * into a fresh operator → adopt that operator as the live session.
   */
  const handleImportFile = async (file: File) => {
    if (importing) return;
    const parsed = await parseWorkspaceFile(file);
    if (!parsed.ok) {
      toast.error(t.sb.importInvalid);
      return;
    }
    setPreview(parsed.payload);
    setPreviewOpen(true);
  };

  const handleConfirmImport = async () => {
    if (importing || !preview) return;
    setImporting(true);
    try {
      const res = await confirmImport(preview);
      if (!res.ok) {
        toast.error(t.sb.importErr, { description: res.message });
        return;
      }
      // adopt the restored operator as the live session
      setPreviewOpen(false);
      setPreview(null);
      setUserId(res.userId);
      queryClient.clear();
      setConsoleTab("systems");
      toast.success(t.sb.importTitle, {
        description: t.sb.importDesc(res.systems, res.records),
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExport = async () => {
    if (!userId || exporting) return;
    setExporting(true);
    try {
      // fresh fetches (not the query cache) so the export is always complete
      const [userData, systemsData] = await Promise.all([
        getUser(userId),
        getSystems(userId),
      ]);
      const systems = systemsData.systems;
      const details = await Promise.all(
        systems.map((s) => getSystemDetail(s.id))
      );
      const payload = {
        format: "wakeel.workspace/v1" as const,
        exportedAt: new Date().toISOString(),
        operator: userData.user,
        systems: details.map(({ system, records }) => ({
          name: system.name,
          description: system.description,
          category: system.category,
          icon: system.icon,
          origin: system.origin,
          status: system.status,
          health: system.health,
          confidence: system.confidence,
          source: system.source,
          blueprint: parseBlueprint(system.blueprint),
          capabilities: parseCapabilities(system.capabilities),
          createdAt: system.createdAt,
          records: records.map((r) => ({
            data: parseRecordData(r.data),
            createdAt: r.createdAt,
          })),
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ws = (userData.user.workspace || "workspace")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const stamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[T:]/g, "-");
      a.href = url;
      a.download = `wakeel-${ws}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const recordTotal = details.reduce((n, d) => n + d.records.length, 0);
      toast.success(t.sb.exportTitle, {
        description: t.sb.exportDesc(systems.length, recordTotal),
      });
    } catch (err) {
      toast.error(t.sb.exportErr, {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-md md:px-4">
      {/* left: identity */}
      <div className="flex min-w-0 items-center gap-2.5">
        <WakeelMark className="size-5 shrink-0" />
        <span className="truncate font-mono text-xs tracking-[0.08em] text-foreground">
          {user?.workspace ?? t.sb.fallbackWorkspace}
        </span>
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
          {"// "}
          {user?.name ?? t.sb.fallbackName}
        </span>
      </div>

      {/* center: live telemetry */}
      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-4 md:flex">
        <LiveClock />
        <span className="h-3.5 w-px bg-border" aria-hidden />
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          {t.sb.systems} <span className="text-foreground" dir="ltr">{systemCount}</span>
        </span>
        <span className="h-3.5 w-px bg-border" aria-hidden />
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-live">
          <span className="size-1.5 rounded-full bg-live shadow-[0_0_6px_rgba(62,207,142,0.9)]" />
          {t.sb.operational}
        </span>
      </div>

      {/* right: palette + operator + dock toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label={t.sb.openPalette}
          data-tour="palette"
          className="hidden h-8 items-center gap-2 rounded-sm border border-border bg-transparent px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex"
        >
          <Search className="size-3.5" />
          <span className="hidden xl:inline">{t.sb.search}</span>
          <kbd className="rounded-[3px] border border-border bg-secondary px-1 font-mono text-[9px] tracking-[0.08em]">
            ⌘K
          </kbd>
        </button>
        <Button
          onClick={toggleAgentDock}
          aria-pressed={agentDockOpen}
          data-tour="dock"
          className={cn(
            "h-8 gap-1.5 rounded-sm px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]",
            agentDockOpen
              ? "border border-gold/50 bg-gold/15 text-gold hover:bg-gold/25"
              : "border border-border bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <Bot className="size-3.5" />
          <span className="hidden lg:inline">{t.sb.agentDock}</span>
        </Button>

        <LangToggle className="hidden sm:flex" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex min-h-11 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:min-h-0"
              aria-label={t.sb.operatorMenu}
            >
              <Avatar className="size-7 border border-gold/30">
                <AvatarFallback className="bg-secondary font-mono text-[10px] text-gold">
                  {initialsOf(user?.name ?? "W")}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 border-border bg-popover">
            <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {user ? `${user.name} · ${user.workspace}` : "OPERATOR"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuLabel className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
              {t.sb.workspaceSection}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={handleExport}
              disabled={exporting || systemCount === 0}
              className="gap-2 font-mono text-[11px] uppercase tracking-[0.1em] focus:bg-secondary focus:text-gold"
            >
              <Download className="size-3.5" /> {t.sb.exportOp}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="gap-2 font-mono text-[11px] uppercase tracking-[0.1em] focus:bg-secondary focus:text-gold"
            >
              {importing ? (
                <span
                  aria-hidden
                  className="size-3.5 shrink-0 animate-spin rounded-full border border-gold/30 border-t-gold"
                />
              ) : (
                <Upload className="size-3.5" />
              )}
              {t.sb.importOp}
            </DropdownMenuItem>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
              }}
            />
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={() => setTourOpen(true)}
              className="gap-2 font-mono text-[11px] uppercase tracking-[0.1em] focus:bg-secondary focus:text-gold"
            >
              <Compass className="size-3.5" /> {t.sb.replayTour}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={handleSwitch}
              className="gap-2 font-mono text-[11px] uppercase tracking-[0.1em] focus:bg-secondary focus:text-gold"
            >
              <LogOut className="size-3.5" /> {t.sb.switchOp}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* import preview — inspect the file BEFORE it restores into a new operator */}
      <ImportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        payload={preview}
        importing={importing}
        currentSystemNames={(systemsData?.systems ?? []).map((s) => s.name)}
        onConfirm={() => void handleConfirmImport()}
      />
    </header>
  );
}
