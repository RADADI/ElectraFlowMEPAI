/**
 * Client-side CSV export utility — Phase 14
 *
 * Pure functions. No server-side generation. No fake files.
 * RFC 4180 compliant escaping.
 */

/** Escape a single CSV cell value. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert an array of row objects to a CSV string. */
export function arrayToCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) {
    return columns ? columns.join(",") + "\n" : "";
  }
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCell).join(",");
  const body = rows.map((row) => cols.map((col) => escapeCell(row[col])).join(",")).join("\n");
  return `${header}\n${body}`;
}

/** Trigger a browser download of CSV content. Returns false if Blob unavailable. */
export function triggerCsvDownload(content: string, filename: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
