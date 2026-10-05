import type { AuditLogRow } from "@mark-matrix/shared";

const COLUMNS = [
  "created_at",
  "user_id",
  "action",
  "entity",
  "entity_id",
  "old_value",
  "new_value",
] as const;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  // CSV escape: wrap in quotes if it contains comma, quote, or newline.
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: AuditLogRow[]): string {
  const lines: string[] = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(
      COLUMNS.map((c) => escapeCell((row as unknown as Record<string, unknown>)[c])).join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Streaming version: yields one row at a time via a ReadableStream so a
 * large result set doesn't buffer the whole CSV in memory.
 */
export function toCsvStream(rows: AsyncIterable<AuditLogRow>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let headerSent = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        controller.enqueue(encoder.encode(COLUMNS.join(",") + "\n"));
        headerSent = true;
      }
      for await (const row of rows) {
        const line =
          COLUMNS.map((c) => escapeCell((row as unknown as Record<string, unknown>)[c])).join(",") +
          "\n";
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}
