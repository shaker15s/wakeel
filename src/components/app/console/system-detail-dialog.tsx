"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CategoryChip,
  EmptyState,
  OriginBadge,
  StatusDot,
  systemIcon,
  timeAgo,
} from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  createRecord,
  deleteRecord,
  deleteSystem,
  getSystemDetail,
  parseBlueprint,
  parseRecordData,
  updateSystem,
} from "@/lib/api-client";
import type { BlueprintField } from "@/lib/api-client";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

/* --------------------------- record value rendering ------------------------ */

function renderCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* ------------------------------ add record form ---------------------------- */

function DynamicFieldInput({
  field,
  value,
  onChange,
}: {
  field: BlueprintField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const type = field.type;
  if (type === "boolean" || type === "bool" || type === "checkbox") {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary/60 px-3">
        <Switch
          checked={!!value}
          onCheckedChange={onChange}
          aria-label={field.label}
        />
        <span className="font-mono text-[11px] text-muted-foreground">
          {value ? "TRUE" : "FALSE"}
        </span>
      </div>
    );
  }
  if ((type === "select" || type === "enum") && field.options?.length) {
    return (
      <Select value={String(value ?? "")} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full border-border bg-secondary/60">
          <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent className="border-border bg-popover">
          {field.options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const htmlType =
    type === "number" || type === "int" || type === "float"
      ? "number"
      : type === "date" || type === "datetime"
        ? "date"
        : "text";
  return (
    <Input
      type={htmlType}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) =>
        onChange(htmlType === "number" ? e.target.value : e.target.value)
      }
      className="h-9 border-border bg-secondary/60 focus-visible:ring-gold/50"
    />
  );
}

/* ------------------------------ main dialog -------------------------------- */

export function SystemDetailDialog() {
  const systemId = useWakeel((s) => s.systemDetailId);
  const close = useWakeel((s) => s.closeSystemDetail);
  const userId = useWakeel((s) => s.userId);
  const queryClient = useQueryClient();

  const [addingRecord, setAddingRecord] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["records", systemId],
    queryFn: () => getSystemDetail(systemId!),
    enabled: !!systemId,
  });

  const system = data?.system;
  const records = data?.records ?? [];
  const blueprint = useMemo(
    () => parseBlueprint(system?.blueprint),
    [system?.blueprint]
  );

  // reset local state whenever the dialog target changes
  // (adjust-state-during-render pattern — no effect needed)
  const [prevSystemId, setPrevSystemId] = useState(systemId);
  if (prevSystemId !== systemId) {
    setPrevSystemId(systemId);
    setAddingRecord(false);
    setDraft({});
    setConfirmDelete(false);
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["records", systemId] });
    queryClient.invalidateQueries({ queryKey: ["systems", userId] });
    queryClient.invalidateQueries({ queryKey: ["activity", userId] });
    queryClient.invalidateQueries({ queryKey: ["user", userId] });
  };

  const addRecord = useMutation({
    mutationFn: () => createRecord(systemId!, draft),
    onSuccess: () => {
      invalidateAll();
      setAddingRecord(false);
      setDraft({});
      toast.success("Record added", {
        description: "Logged to the ledger and saved to your system.",
      });
    },
    onError: (err: Error) =>
      toast.error("Could not add record", { description: err.message }),
  });

  const removeRecord = useMutation({
    mutationFn: (id: string) => deleteRecord(id),
    onSuccess: () => {
      invalidateAll();
      toast("Record deleted", { description: "Removed from the system." });
    },
    onError: (err: Error) =>
      toast.error("Delete failed", { description: err.message }),
  });

  const patchSystem = useMutation({
    mutationFn: (status: "ACTIVE" | "ARCHIVED") =>
      updateSystem(systemId!, { status }),
    onSuccess: (_data, status) => {
      invalidateAll();
      toast.success(status === "ARCHIVED" ? "System archived" : "System restored");
    },
    onError: (err: Error) =>
      toast.error("Update failed", { description: err.message }),
  });

  const destroySystem = useMutation({
    mutationFn: () => deleteSystem(systemId!),
    onSuccess: () => {
      invalidateAll();
      close();
      toast.success("System deleted", {
        description: "It and all of its records are gone. Logged to the ledger.",
      });
    },
    onError: (err: Error) =>
      toast.error("Delete failed", { description: err.message }),
  });

  const columns: BlueprintField[] =
    blueprint.fields.length > 0
      ? blueprint.fields
      : records.length > 0
        ? Object.keys(parseRecordData(records[0].data)).map((key) => ({
            key,
            label: key,
            type: "text",
          }))
        : [];

  return (
    <Dialog
      open={!!systemId}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent
        className="max-h-[88vh] max-w-3xl overflow-y-auto border-border bg-card"
        showCloseButton={!destroySystem.isPending}
      >
        {isLoading ? (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-sm" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : isError || !system ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-destructive">
              ⚠ SYSTEM UNAVAILABLE
            </p>
            <p className="text-sm text-muted-foreground">
              {error?.message ?? "This system could not be loaded."}
            </p>
            <Button variant="ghost" size="sm" onClick={close} className="font-mono text-[11px] uppercase tracking-[0.12em]">
              Close
            </Button>
          </div>
        ) : (
          (() => {
            const Icon = systemIcon(system.icon);
            const isArchived = system.status === "ARCHIVED";
            return (
              <div className="flex flex-col gap-6">
                {/* header */}
                <div className="flex items-start gap-3.5 pr-8">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-gold/25 bg-gold/5 text-gold">
                    <Icon className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DialogTitle className="font-display text-xl font-bold tracking-tight">
                        {system.name}
                      </DialogTitle>
                      <OriginBadge origin={system.origin} />
                      <CategoryChip category={system.category} />
                      <StatusDot status={system.status} />
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {system.status}
                      </span>
                    </div>
                    {system.description && (
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {system.description}
                      </p>
                    )}
                    {system.source && (
                      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/60">
                        SRC · {system.source}
                      </p>
                    )}
                  </div>
                </div>

                {/* blueprint summary */}
                <section className="flex flex-col gap-2.5">
                  <MonoLabel>BLUEPRINT · ENTITY FIELDS</MonoLabel>
                  {blueprint.fields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No typed fields were specified for this system.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border">
                      {blueprint.fields.map((f, i) => (
                        <div
                          key={f.key}
                          className={cn(
                            "grid grid-cols-[1fr_auto] items-center gap-3 px-3.5 py-2.5",
                            i > 0 && "border-t border-border/60"
                          )}
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm text-foreground">
                              {f.label}
                            </span>
                            <span className="truncate font-mono text-[10px] text-muted-foreground/70">
                              {f.key}
                            </span>
                          </div>
                          <span className="rounded-sm border border-gold/30 bg-gold/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-gold">
                            {f.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {blueprint.automations.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <MonoLabel className="mt-1.5">AUTOMATIONS</MonoLabel>
                      <ul className="flex flex-col gap-1">
                        {blueprint.automations.map((a) => (
                          <li
                            key={a}
                            className="flex items-start gap-2 text-[13px] text-muted-foreground"
                          >
                            <span className="mt-1 size-1 shrink-0 rounded-full bg-gold" />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                {/* records */}
                <section className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <MonoLabel>
                      RECORDS · {records.length}
                    </MonoLabel>
                    <Button
                      size="sm"
                      onClick={() => setAddingRecord((v) => !v)}
                      disabled={isArchived}
                      className="h-8 gap-1.5 rounded-sm bg-primary font-mono text-[10px] uppercase tracking-[0.12em] text-primary-foreground hover:bg-gold-pale"
                    >
                      {addingRecord ? (
                        <>
                          <X className="size-3" /> Cancel
                        </>
                      ) : (
                        <>
                          <Plus className="size-3" /> Add record
                        </>
                      )}
                    </Button>
                  </div>

                  {/* inline add form */}
                  <AnimatePresence>
                    {addingRecord && (
                      <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          addRecord.mutate();
                        }}
                        className="overflow-hidden"
                      >
                        <div className="grid gap-3 rounded-lg border border-gold/25 bg-gold/[0.04] p-4 sm:grid-cols-2">
                          {columns.map((f) => (
                            <div key={f.key} className="flex flex-col gap-1.5">
                              <Label className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                                {f.label}
                              </Label>
                              <DynamicFieldInput
                                field={f}
                                value={draft[f.key]}
                                onChange={(v) =>
                                  setDraft((d) => ({ ...d, [f.key]: v }))
                                }
                              />
                            </div>
                          ))}
                          {columns.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              This system has no blueprint fields — records
                              would be empty objects.
                            </p>
                          )}
                          <div className="sm:col-span-2">
                            <Button
                              type="submit"
                              disabled={
                                addRecord.isPending || columns.length === 0
                              }
                              className="h-9 w-full bg-primary font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale sm:w-48"
                            >
                              {addRecord.isPending ? (
                                <>
                                  <Loader2 className="animate-spin" /> SAVING…
                                </>
                              ) : (
                                "SAVE RECORD"
                              )}
                            </Button>
                          </div>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {/* records table */}
                  {records.length === 0 ? (
                    <EmptyState
                      title="NO RECORDS YET"
                      copy="Add the first record to start filling this system."
                      className="py-8"
                    />
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            {columns.map((c) => (
                              <TableHead
                                key={c.key}
                                className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                              >
                                {c.label}
                              </TableHead>
                            ))}
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {records.map((rec) => {
                            const data = parseRecordData(rec.data);
                            return (
                              <TableRow key={rec.id}>
                                {columns.map((c) => (
                                  <TableCell
                                    key={c.key}
                                    className="max-w-[220px] truncate text-[13px] text-foreground/90"
                                  >
                                    {renderCellValue(data[c.key])}
                                  </TableCell>
                                ))}
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                                        aria-label="Record actions"
                                      >
                                        <MoreHorizontal className="size-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="border-border bg-popover"
                                    >
                                      <DropdownMenuItem
                                        onClick={() => removeRecord.mutate(rec.id)}
                                        className="gap-2 font-mono text-[11px] uppercase tracking-[0.1em] focus:bg-destructive/10 focus:text-destructive"
                                      >
                                        <Trash2 className="size-3.5" /> Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>

                {/* danger zone */}
                <section className="flex flex-col gap-2 border-t border-border pt-4">
                  <MonoLabel className="text-muted-foreground/70">
                    DANGER ZONE
                  </MonoLabel>
                  <div className="flex flex-wrap gap-2">
                    {isArchived ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patchSystem.mutate("ACTIVE")}
                        disabled={patchSystem.isPending}
                        className="h-9 gap-1.5 border border-live/40 font-mono text-[10px] uppercase tracking-[0.12em] text-live hover:bg-live/10"
                      >
                        {patchSystem.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <ArchiveRestore className="size-3.5" />
                        )}
                        Restore system
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patchSystem.mutate("ARCHIVED")}
                        disabled={patchSystem.isPending}
                        className="h-9 gap-1.5 border border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {patchSystem.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Archive className="size-3.5" />
                        )}
                        Archive system
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={destroySystem.isPending}
                      className="h-9 gap-1.5 border border-destructive/40 font-mono text-[10px] uppercase tracking-[0.12em] text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" /> Delete system
                    </Button>
                    <span className="ml-auto self-center font-mono text-[10px] text-muted-foreground/60">
                      CREATED {timeAgo(system.createdAt)}
                    </span>
                  </div>
                </section>
              </div>
            );
          })()
        )}
      </DialogContent>

      {/* delete system confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Delete this system?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {system?.name} and all of its records will be permanently
              removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-[11px] uppercase tracking-[0.12em]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                destroySystem.mutate();
                setConfirmDelete(false);
              }}
              className="bg-destructive font-mono text-[11px] uppercase tracking-[0.12em] text-white hover:bg-destructive/90"
            >
              {destroySystem.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                "DELETE"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
