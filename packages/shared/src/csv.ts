// RFC4180-ish CSV parser — quoted fields, embedded commas/newlines, CRLF or
// LF, optional BOM, ragged trailing rows preserved. Empty input yields [].
//
// Embedded newlines are intentionally preserved inside quoted fields, so a single
// logical row can span multiple physical lines. The caller cannot assume line
// count == row count.

export function parseCsv(text: string): string[][] {
  if (text.length === 0) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") {
        pushRow();
        i += 2;
        continue;
      }
      pushRow();
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

export interface ParsedEnrollRow {
  row: number;
  rollNumber: string;
}
export interface ParsedEnrollError {
  row: number;
  reason: string;
}
export interface ParsedEnrollCsv {
  rows: ParsedEnrollRow[];
  errors: ParsedEnrollError[];
}

export function parseEnrollCsv(text: string): ParsedEnrollCsv {
  const all = parseCsv(text);
  if (all.length === 0) return { rows: [], errors: [] };

  const header = all[0] ?? [];
  const rollIdx = header.findIndex(
    (h) => h.trim().toLowerCase() === "roll_number",
  );
  if (rollIdx === -1) {
    return { rows: [], errors: [{ row: 1, reason: "missing_required_column" }] };
  }

  // If any data row has content, treat blank rows as noise between rows and
  // skip them silently. If every data row is blank, the file has no roll
  // numbers at all — surface each blank row as a validation_failed error so
  // the admin sees an empty roll number at the offending spreadsheet row.
  const hasData = all
    .slice(1)
    .some((line) => !(line.length === 1 && line[0] === ""));

  const out: ParsedEnrollCsv = { rows: [], errors: [] };
  for (let r = 1; r < all.length; r++) {
    const line = all[r] ?? [];
    if (hasData && line.length === 1 && line[0] === "") continue; // blank line
    const raw = line[rollIdx];
    if (raw === undefined) {
      out.errors.push({ row: r + 1, reason: "validation_failed" });
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      out.errors.push({ row: r + 1, reason: "validation_failed" });
      continue;
    }
    out.rows.push({ row: r + 1, rollNumber: trimmed.toUpperCase() });
  }
  return out;
}
