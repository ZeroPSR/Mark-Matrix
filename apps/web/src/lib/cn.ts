export function cn(...args: Array<string | undefined | null | false>): string {
  let out = "";
  for (const a of args) {
    if (typeof a === "string" && a.length > 0) {
      out = out.length === 0 ? a : `${out} ${a}`;
    }
  }
  return out;
}