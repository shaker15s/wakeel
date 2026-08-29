/**
 * Minimal, dependency-free CSV utilities for the records CSV-import flow.
 * Handles quoted fields, escaped quotes ("") CRLF line endings and a UTF-8 BOM.
 */

export interface ParsedCsv {
  headers: string[];
  /** data rows (no header), each aligned with `headers` (short rows padded) */
  rows: string[][];
}

/**
 * Parse raw CSV text into headers + rows. Never throws on malformed content —
 * best-effort RFC-4180 parsing (quotes, embedded commas/newlines, CRLF, BOM).
 */
export function parseCsv(raw: string): ParsedCsv {
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let sawAnyChar = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    // skip fully-empty trailing lines
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    sawAnyChar = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (!sawAnyChar) return { headers: [], rows: [] };
  if (cell !== "" || row.length > 0) endRow();

  const [headerRow = [], ...data] = rows;
  const headers = headerRow.map((h) => h.trim());
  const padded = data.map((r) => {
    const copy = r.slice(0, headers.length);
    while (copy.length < headers.length) copy.push("");
    return copy;
  });
  return { headers, rows: padded };
}

/**
 * Guess which CSV column feeds each blueprint field (index or null).
 * Matching: exact header↔label, exact header↔key (case/spacing-insensitive),
 * then substring containment both ways. Each column is used at most once
 * (greedy, first-come).
 */
export function guessColumnMapping(
  headers: string[],
  fields: { key: string; label: string }[]
): (number | null)[] {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.]+/g, "").trim();
  const used = new Set<number>();

  const find = (want: string, mode: "exact" | "contains"): number | null => {
    const w = norm(want);
    if (!w) return null;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      if (norm(headers[i]) === w) {
        used.add(i);
        return i;
      }
    }
    if (mode === "contains") {
      for (let i = 0; i < headers.length; i++) {
        if (used.has(i)) continue;
        const h = norm(headers[i]);
        if (h && (h.includes(w) || w.includes(h))) {
          used.add(i);
          return i;
        }
      }
    }
    return null;
  };

  // pass 1: exact label / exact key; pass 2: substring containment
  const mapping: (number | null)[] = fields.map(() => null);
  fields.forEach((f, i) => (mapping[i] = find(f.label, "exact")));
  fields.forEach((f, i) => {
    if (mapping[i] === null) mapping[i] = find(f.key, "exact");
  });
  fields.forEach((f, i) => {
    if (mapping[i] === null) mapping[i] = find(f.label, "contains");
  });
  return mapping;
}
