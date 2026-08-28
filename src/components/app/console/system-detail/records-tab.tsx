"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Sprout,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  bulkDeleteRecords,
  createRecord,
  deleteRecord,
  parseRecordData,
  seedSystem,
  updateRecord,
} from "@/lib/api-client";
import type { BlueprintField, SystemRecordDTO } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* --------------------------- record value rendering ------------------------ */

export function renderCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* -------------------------------- CSV export ------------------------------- */

function csvEscape(v: unknown): string {
  const s = renderCellValue(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportSystemCsv(
  systemName: string,
  cols: BlueprintField[],
  rows: SystemRecordDTO[],
  suffix = "records"
) {
  const headers = cols.length > 0 ? cols.map((c) => c.label) : ["data"];
  const lines = [headers.map((h) => csvEscape(h)).join(",")];
  for (const rec of rows) {
    const data = parseRecordData(rec.data);
    const row =
      cols.length > 0
        ? cols.map((c) => csvEscape(data[c.key]))
        : [csvEscape(JSON.stringify(data))];
    lines.push(row.join(","));
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${systemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  const t = useT();
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
          {value ? t.recs.true : t.recs.false}
        </span>
      </div>
    );
  }
  if ((type === "select" || type === "enum") && field.options?.length) {
    return (
      <Select value={String(value ?? "")} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full border-border bg-secondary/60">
          <SelectValue placeholder={t.recs.selectField(field.label)} />
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

/* ------------------------------ selection box ------------------------------ */

function SelectBox({
  checked,
  indeterminate,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
        checked || indeterminate
          ? "border-gold bg-gold text-black hover:bg-gold-pale"
          : "border-border bg-secondary/50 hover:border-gold/60 hover:bg-secondary",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded-full bg-black" />
      ) : checked ? (
        <Check className="size-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}

/* ---------------------------- keyboard hint chip --------------------------- */

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-border bg-secondary px-1 font-mono text-[9px] font-medium uppercase text-foreground/80 shadow-[inset_0_-1px_0_0_rgba(245,239,228,0.06)]">
      {children}
    </kbd>
  );
}

/* ------------------------------- records tab ------------------------------- */

export function RecordsTab({
  systemId,
  systemName,
  isArchived,
  records,
  columns,
  invalidateAll,
}: {
  systemId: string;
  systemName: string;
  isArchived: boolean;
  records: SystemRecordDTO[];
  columns: BlueprintField[];
  invalidateAll: () => void;
}) {
  const t = useT();
  const [addingRecord, setAddingRecord] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  /** keyboard cursor — index into `records`, moved with j/k, armed with x/e */
  const [cursor, setCursor] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // keep the cursor valid as records come and go (adjust-during-render pattern)
  const [prevLen, setPrevLen] = useState(records.length);
  if (prevLen !== records.length) {
    setPrevLen(records.length);
    if (cursor !== null) {
      setCursor(records.length === 0 ? null : Math.min(cursor, records.length - 1));
    }
  }

  // follow the cursor with the scroll container
  useEffect(() => {
    if (cursor === null) return;
    rowRefs.current.get(cursor)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const addRecord = useMutation({
    mutationFn: () => createRecord(systemId, draft),
    onSuccess: () => {
      invalidateAll();
      setAddingRecord(false);
      setDraft({});
      toast.success(t.recs.toastAddOk, {
        description: t.recs.toastAddDesc,
      });
    },
    onError: (err: Error) =>
      toast.error(t.recs.toastAddErr, { description: err.message }),
  });

  /** LLM-grown sample rows — offered right from the empty state. */
  const seed = useMutation({
    mutationFn: () => seedSystem(systemId, 5),
    onSuccess: (res) => {
      invalidateAll();
      toast.success(t.recs.seedOk, {
        description: t.recs.seedOkDesc(res.seeded),
      });
    },
    onError: (err: Error) =>
      toast.error(t.recs.seedErr, { description: err.message }),
  });

  const removeRecord = useMutation({
    mutationFn: (id: string) => deleteRecord(id),
    onSuccess: (_data, removedId) => {
      invalidateAll();
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(removedId);
        return next;
      });
      toast(t.recs.toastDelOk, { description: t.recs.toastDelDesc });
    },
    onError: (err: Error) =>
      toast.error(t.recs.toastDelErr, { description: err.message }),
  });

  const editRecord = useMutation({
    mutationFn: () => updateRecord(editingId!, editDraft),
    onSuccess: () => {
      invalidateAll();
      setEditingId(null);
      setEditDraft({});
      toast.success(t.recs.toastUpdOk, {
        description: t.recs.toastUpdDesc,
      });
    },
    onError: (err: Error) =>
      toast.error(t.recs.toastUpdErr, { description: err.message }),
  });

  const bulkDelete = useMutation({
    mutationFn: () => bulkDeleteRecords([...selected]),
    onSuccess: (res) => {
      invalidateAll();
      setSelected(new Set());
      setConfirmBulk(false);
      toast.success(t.recs.toastBulkOk(res.deleted), {
        description: t.recs.toastBulkDesc,
      });
    },
    onError: (err: Error) => {
      setConfirmBulk(false);
      toast.error(t.recs.toastBulkErr, { description: err.message });
    },
  });

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = records.length > 0 && selected.size === records.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(records.map((r) => r.id)));

  const selectedRecords = records.filter((r) => selected.has(r.id));

  /** power-user keyboard model: j/k move, x toggles, e edits, esc dismisses */
  const onTableKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    // let form fields and open menus consume their own keys
    if (target.closest(
      "input, textarea, select, [role='combobox'], [role='listbox'], [role='option'], [role='menu'], [data-radix-popper-content-wrapper]"
    ))
      return;
    if (records.length === 0) return;
    const key = e.key;
    if (key === "j" || key === "J" || key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c === null ? 0 : Math.min(c + 1, records.length - 1)));
    } else if (key === "k" || key === "K" || key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c === null ? 0 : Math.max(c - 1, 0)));
    } else if (key === "x" || key === "X") {
      if (cursor === null || isArchived) return;
      e.preventDefault();
      toggleRow(records[cursor].id);
    } else if (key === "e" || key === "E") {
      if (cursor === null || isArchived) return;
      e.preventDefault();
      const rec = records[cursor];
      setAddingRecord(false);
      setEditingId(rec.id);
      setEditDraft({ ...parseRecordData(rec.data) });
    } else if (key === "Escape") {
      setCursor(null);
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <MonoLabel>{t.recs.header(records.length)}</MonoLabel>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => exportSystemCsv(systemName, columns, records)}
            disabled={records.length === 0}
            className="h-8 gap-1.5 rounded-sm border border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Download className="size-3" /> CSV
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setAddingRecord((v) => !v);
            }}
            disabled={isArchived}
            className="h-8 gap-1.5 rounded-sm bg-primary font-mono text-[10px] uppercase tracking-[0.12em] text-primary-foreground hover:bg-gold-pale"
          >
            {addingRecord ? (
              <>
                <X className="size-3" /> {t.recs.cancel}
              </>
            ) : (
              <>
                <Plus className="size-3" /> {t.recs.add}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* bulk selection toolbar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/35 bg-gold/[0.05] px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
                {t.recs.selected(selected.size)}
              </span>
              <div className="ms-auto flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    exportSystemCsv(systemName, columns, selectedRecords, "selection")
                  }
                  className="h-7 gap-1.5 rounded-sm px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Download className="size-3" /> {t.recs.export}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                  className="h-7 rounded-sm px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {t.recs.clearSel}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmBulk(true)}
                  disabled={isArchived || bulkDelete.isPending}
                  className="h-7 gap-1.5 rounded-sm border border-destructive/40 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-destructive hover:bg-destructive/10"
                >
                  {bulkDelete.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                  {t.recs.deleteSel}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  {t.recs.noFields}
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
                      <Loader2 className="animate-spin" /> {t.recs.saving}
                    </>
                  ) : (
                    t.recs.saveRecord
                  )}
                </Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* inline edit form */}
      <AnimatePresence>
        {editingId && !addingRecord && (
          <motion.form
            key={editingId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              editRecord.mutate();
            }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 rounded-lg border border-gold/40 bg-gold/[0.06] p-4 sm:grid-cols-2">
              <div className="flex items-center gap-2 sm:col-span-2">
                <Pencil className="size-3.5 text-gold" />
                <MonoLabel gold className="text-[9px]">
                  {t.recs.editing}
                </MonoLabel>
              </div>
              {columns.map((f) => (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <Label className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    {f.label}
                  </Label>
                  <DynamicFieldInput
                    field={f}
                    value={editDraft[f.key]}
                    onChange={(v) =>
                      setEditDraft((d) => ({ ...d, [f.key]: v }))
                    }
                  />
                </div>
              ))}
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  type="submit"
                  disabled={editRecord.isPending || columns.length === 0}
                  className="h-9 flex-1 bg-primary font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale sm:flex-none sm:px-6"
                >
                  {editRecord.isPending ? (
                    <>
                      <Loader2 className="animate-spin" /> {t.recs.saving}
                    </>
                  ) : (
                    t.recs.saveChanges
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setEditDraft({});
                  }}
                  className="h-9 border border-border font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {t.recs.discard}
                </Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* records table */}
      {records.length === 0 ? (
        <EmptyState
          title={t.recs.noRecordsT}
          copy={t.recs.noRecordsC}
          className="py-8"
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={seed.isPending || isArchived || columns.length === 0}
              onClick={() => seed.mutate()}
              className="group relative h-9 overflow-hidden bg-gold font-mono text-[10px] uppercase tracking-[0.14em] text-[#0A0908] hover:bg-gold-pale"
            >
              {seed.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t.recs.seeding}
                </>
              ) : (
                <>
                  <Sprout className="size-3.5 transition-transform group-hover:-rotate-12" />
                  {t.recs.seed}
                </>
              )}
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div
            tabIndex={0}
            onKeyDown={onTableKeyDown}
            aria-label={t.recs.header(records.length)}
            className="min-w-0 overflow-hidden rounded-lg border border-border transition-shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/50"
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-9 pr-0">
                    <SelectBox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleAll}
                      disabled={isArchived}
                      label={t.recs.selectAll}
                    />
                  </TableHead>
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
                {records.map((rec, idx) => {
                  const data = parseRecordData(rec.data);
                  const isEditing = rec.id === editingId;
                  const isSelected = selected.has(rec.id);
                  const isCursor = cursor === idx;
                  return (
                    <TableRow
                      key={rec.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(idx, el);
                        else rowRefs.current.delete(idx);
                      }}
                      data-selected={isSelected || isEditing || undefined}
                      data-cursor={isCursor || undefined}
                      className={cn(
                        "transition-colors",
                        (isSelected || isEditing) &&
                          "bg-gold/[0.06] hover:bg-gold/[0.09]",
                        isCursor &&
                          !isSelected &&
                          !isEditing &&
                          "bg-gold/[0.045] hover:bg-gold/[0.07]",
                        // gold inline-start rail marks the keyboard cursor
                        isCursor &&
                          "shadow-[inset_2px_0_0_0_#E8B44A] rtl:shadow-[inset_-2px_0_0_0_#E8B44A]"
                      )}
                    >
                      <TableCell className="pr-0">
                        <SelectBox
                          checked={isSelected}
                          onChange={() => toggleRow(rec.id)}
                          disabled={isArchived}
                          label={t.recs.selectOne(renderCellValue(data[columns[0]?.key ?? "id"]))}
                        />
                      </TableCell>
                      {columns.map((c) => (
                        <TableCell
                          key={c.key}
                          dir="auto"
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
                              aria-label={t.recs.recActions}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="border-border bg-popover"
                          >
                            <DropdownMenuItem
                              onClick={() => {
                                setAddingRecord(false);
                                setEditingId(rec.id);
                                setEditDraft({ ...data });
                              }}
                              disabled={isArchived}
                              className="gap-2 font-mono text-[11px] uppercase tracking-[0.1em] focus:bg-gold/10 focus:text-gold"
                            >
                              <Pencil className="size-3.5" /> {t.recs.edit}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => removeRecord.mutate(rec.id)}
                              className="gap-2 font-mono text-[11px] uppercase tracking-[0.1em] focus:bg-destructive/10 focus:text-destructive"
                            >
                              <Trash2 className="size-3.5" /> {t.common.delete}
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
          {/* keyboard hints — OPS-DECK power-user affordance */}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60"
            aria-hidden
          >
            <span className="flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> {t.recs.kbdNav}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>X</Kbd> {t.recs.kbdSelect}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>E</Kbd> {t.recs.kbdEdit}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> {t.recs.kbdClear}
            </span>
          </div>
        </>
      )}

      {/* bulk delete confirm */}
      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {t.recs.delBulkTitle(selected.size)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.recs.delBulkDesc(systemName)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-[11px] uppercase tracking-[0.12em]">
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                bulkDelete.mutate();
              }}
              className="bg-destructive font-mono text-[11px] uppercase tracking-[0.12em] text-white hover:bg-destructive/90"
            >
              {bulkDelete.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                t.common.delete
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
