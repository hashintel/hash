import type { DetailColumn } from "./types";

const neutralizeSpreadsheetFormula = (value: string): string => {
  let index = 0;
  while (index < value.length && value.charCodeAt(index) <= 0x20) {
    index += 1;
  }
  return index < value.length && "=+-@".includes(value[index]!)
    ? `'${value}`
    : value;
};

const encodeCsvValue = (
  value: string | number | null | undefined,
  alwaysQuote = false,
): string => {
  if (value == null) {
    return "";
  }
  const safeValue =
    typeof value === "string" ? neutralizeSpreadsheetFormula(value) : value;
  const serializedValue = String(safeValue);
  if (
    alwaysQuote ||
    serializedValue.includes(",") ||
    serializedValue.includes('"') ||
    serializedValue.includes("\n") ||
    serializedValue.includes("\r")
  ) {
    return `"${serializedValue.replace(/"/g, '""')}"`;
  }
  return serializedValue;
};

export function buildCsvContent(
  columns: DetailColumn[],
  rows: Record<string, string | number | null>[],
): string {
  const headers = columns.map((col) => {
    const source =
      col.source_table && col.source_field
        ? ` (${col.source_table}.${col.source_field})`
        : "";
    return encodeCsvValue(`${col.label}${source}`, true);
  });

  const csvRows = rows.map((row) =>
    columns
      .map((col) => {
        return encodeCsvValue(row[col.key]);
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
