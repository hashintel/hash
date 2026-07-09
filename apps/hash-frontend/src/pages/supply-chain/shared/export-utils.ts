import type { DetailColumn } from "./types";

export function buildCsvContent(
  columns: DetailColumn[],
  rows: Record<string, string | number | null>[],
): string {
  const headers = columns.map((col) => {
    if (col.source_table && col.source_field) {
      return `"${col.label} (${col.source_table}.${col.source_field})"`;
    }
    return `"${col.label}"`;
  });

  const csvRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col.key];
        if (val == null) {
          return "";
        }
        if (
          typeof val === "string" &&
          (val.includes(",") || val.includes('"'))
        ) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      })
      .join(","),
  );

  return [headers.join(","), ...csvRows].join("\n");
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
