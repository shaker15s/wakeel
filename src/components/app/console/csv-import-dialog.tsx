"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileSpreadsheet, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonoLabel } from "@/components/app/motion-bits";
import { importCsvRecords } from "@/lib/api-client";
import type { BlueprintField } from "@/lib/api-client";
import type { ParsedCsv } from "@/lib/csv";
import { guessColumnMapping } from "@/lib/csv";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Mirror of the server's type coercion (src/lib/wakeel/fields.ts) so the
 * preview shows the EXACT value that will land, not the raw CSV text.
 */
function coercePreview(field: BlueprintField, raw: string): string {
  const v = raw.trim();
  if (v === "") return "";
  const type = field.type.toLowerCase();
  if (type === "select" || type === "enum") {
    if (!field.options || field.options.length === 0) return v;
    return field.options.includes(v) ? v : field.options[0];
  }
  if (type === "boolean" || type === "bool" || type === "checkbox") {
    return v === "true" || v === "TRUE" || v === "1" ? "TRUE" : "FALSE";
  }
  if (type === "number" || type === "int" || type === "float") {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : "0";
  }
  return v.slice(0, 200);
}

/**
 * CSV IMPORT — column mapping dialog (records tab).
 *
 * The parent parses the file (src/lib/csv.ts) and hands over {headers, rows};
 * this dialog maps every blueprint field to a CSV column (auto-guessed via
 * guessColumnMapping, adjustable per field), previews the first rows with the
 * exact values that will land, then POSTs the mapped rows to the import route.
 */

export function CsvImportDialog({
  open,
  onOpenChange,
  systemId,
  columns,
  csv,
  fileName,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemId: string;
  columns: BlueprintField[];
  csv: ParsedCsv | null;
  fileName: string;
  onImported: () => void;
}) {
  const t = useT();
  const [mapping, setMapping] = useState<(number | null)[]>(
    csv ? guessColumnMapping(csv.headers, columns) : columns.map(() => null)
  );

  // re-guess the mapping whenever a new file is mapped (adjust-during-render)
  const [prevFile, setPrevFile] = useState(fileName);
  if (prevFile !== fileName && csv) {
    setPrevFile(fileName);
    setMapping(guessColumnMapping(csv.headers, columns));
  }

  const mappedCount = mapping.filter((m) => m !== null).length;

  /** rows exactly as the server will receive them */
  const mappedRows = useMemo(() => {
    if (!csv) return [];
    return csv.rows.map((row) => {
      const rec: Record<string, unknown> = {};
      columns.forEach((f, fi) => {
        const ci = mapping[fi];
        if (ci === null) return;
        const raw = row[ci] ?? "";
        if (String(raw).trim() === "") return;
        rec[f.key] = raw;
      });
      return rec;
    });
  }, [csv, columns, mapping]);

  const importMutation = useMutation({
    mutationFn: () => importCsvRecords(systemId, mappedRows),
    onSuccess: (res) => {
      toast.success(t.recs.csvOk(res.imported), {
        description: t.recs.csvOkDesc,
      });
      onImported();
    },
    onError: (err: Error) =>
      toast.error(t.recs.csvErr, { description: err.message }),
  });

  const previewRows = csv ? csv.rows.slice(0, 3) : [];
  const mappedFields = columns.filter((_, i) => mapping[i] !== null);

  return (
    <Dialog open={open} onOpenChange={(o) => !importMutation.isPending && onOpenChange(o)}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!importMutation.isPending}
        className="corner-frame wakeel-scrollbar max-h-[88vh] max-w-lg overflow-y-auto border-border bg-card p-0 shadow-[0_0_90px_-12px_rgba(232,180,74,0.18)]"
      >
        <div className="relative overflow-hidden">
          <div className="bg-blueprint pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative p-5 sm:p-6">
            <DialogHeader className="gap-2 text-start">
              <MonoLabel gold className="animate-blink">
                [ {t.recs.csvTitle} ]
              </MonoLabel>
              <DialogTitle className="font-display text-xl font-bold tracking-tight">
                {t.recs.csvImport}
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed">
                {t.recs.csvDesc}
              </DialogDescription>
            </DialogHeader>

            {csv && (
              <div className="mt-4 flex flex-col gap-3.5">
                {/* file identity */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-gold/30 bg-gold/10 text-gold">
                    <FileSpreadsheet className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground" dir="ltr">
                      {fileName}
                    </p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground" dir="ltr">
                      {csv.headers.length} COL
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span>
                      {t.recs.csvRows(csv.rows.length)}
                    </span>
                    <span>
                      {t.recs.csvCols(csv.headers.length)}
                    </span>
                  </div>
                </div>

                {/* column mapping rows */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <MonoLabel className="text-[9px] text-muted-foreground/70">
                      {t.recs.csvFieldCol} → {t.recs.csvMapCol}
                    </MonoLabel>
                    {mappedCount === columns.length ? (
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-live">
                        ✓ {t.recs.csvPreviewAllMapped}
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-gold">
                        {t.recs.csvUnmapped(columns.length - mappedCount)}
                      </span>
                    )}
                  </div>
                  <div className="wakeel-scrollbar flex max-h-52 flex-col overflow-y-auto rounded-lg border border-border bg-background/60">
                    {columns.map((f, i) => {
                      const colIdx = mapping[i];
                      return (
                        <motion.div
                          key={f.key}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.03 * i, duration: 0.22 }}
                          className={cn(
                            "grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2",
                            i > 0 && "border-t border-border/60"
                          )}
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-[13px] text-foreground" dir="auto">
                              {f.label}
                            </span>
                            <span className="truncate font-mono text-[9px] text-muted-foreground/70" dir="ltr">
                              {f.key} · {f.type}
                            </span>
                          </div>
                          <Select
                            value={colIdx === null ? "__skip__" : String(colIdx)}
                            onValueChange={(v) =>
                              setMapping((prev) =>
                                prev.map((m, mi) =>
                                  mi === i ? (v === "__skip__" ? null : Number(v)) : m
                                )
                              )
                            }
                          >
                            <SelectTrigger
                              aria-label={t.recs.csvMapCol}
                              className={cn(
                                "h-8 w-40 border-border bg-secondary/60 font-mono text-[11px]",
                                colIdx === null && "text-muted-foreground"
                              )}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-border bg-popover">
                              <SelectItem value="__skip__" className="font-mono text-[11px]">
                                {t.recs.csvSkip}
                              </SelectItem>
                              {csv.headers.map((h, hi) => (
                                <SelectItem
                                  key={`${hi}-${h}`}
                                  value={String(hi)}
                                  className="font-mono text-[11px]"
                                >
                                  {h || `#${hi + 1}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* preview */}
                {mappedFields.length > 0 && previewRows.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <MonoLabel className="text-[9px] text-muted-foreground/70">
                      {t.recs.csvPreview}
                    </MonoLabel>
                    <div className="wakeel-scrollbar overflow-x-auto rounded-lg border border-border bg-black/40">
                      <table className="w-full min-w-max text-start font-mono text-[10px]" dir="ltr">
                        <thead>
                          <tr className="border-b border-border/60">
                            {mappedFields.map((f) => (
                              <th
                                key={f.key}
                                className="whitespace-nowrap px-2.5 py-1.5 text-start font-medium uppercase tracking-[0.1em] text-gold/80"
                              >
                                {f.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, ri) => (
                            <tr
                              key={ri}
                              className={cn(
                                "border-border/40",
                                ri > 0 && "border-t"
                              )}
                            >
                              {mappedFields.map((f) => {
                                const fi = columns.indexOf(f);
                                const ci = mapping[fi];
                                const cell =
                                  ci === null
                                    ? ""
                                    : coercePreview(f, row[ci] ?? "");
                                return (
                                  <td
                                    key={f.key}
                                    className="max-w-40 truncate whitespace-nowrap px-2.5 py-1.5 text-foreground/85"
                                  >
                                    {cell === "" ? "—" : cell}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* actions */}
                <div className="flex items-center justify-end gap-2 border-t border-border pt-3.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={importMutation.isPending}
                    onClick={() => onOpenChange(false)}
                    className="h-9 rounded-sm border border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {t.common.cancel}
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      importMutation.isPending ||
                      mappedCount === 0 ||
                      csv.rows.length === 0
                    }
                    onClick={() => importMutation.mutate()}
                    className="h-9 gap-1.5 rounded-sm bg-primary font-mono text-[10px] uppercase tracking-[0.12em] text-primary-foreground shadow-[0_0_20px_-6px_rgba(232,180,74,0.55)] hover:bg-gold-pale"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Table2 className="size-3.5" />
                    )}
                    {importMutation.isPending
                      ? t.recs.csvImporting
                      : t.recs.csvImportRows(csv.rows.length)}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
