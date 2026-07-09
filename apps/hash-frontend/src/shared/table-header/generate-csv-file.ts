import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

import type { GridRow } from "../../components/grid/grid";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";

export type CsvFile = {
  title: string;
  content: string[][];
};

/**
 * Generate the contents of a CSV file from the currently displayed table columns and rows.
 *
 * Most columns can be derived generically (strings are used directly, booleans become Yes/No,
 * property values are stringified). Columns whose row value is an identifier rather than a
 * human-readable string (e.g. actor or web ids that are resolved to display names elsewhere in
 * the component) must be translated by the caller via `resolveCell`, which takes precedence over
 * the generic handling below.
 */
export const generateCsvFile = <R extends GridRow>({
  columns,
  rows,
  title,
  resolveCell,
}: {
  columns: SizedGridColumn[];
  rows: R[];
  title: string;
  resolveCell?: (key: string, row: R) => string | undefined;
}): CsvFile => {
  const columnRowKeys = columns.map(({ id }) => id);

  const tableContentColumnTitles = columns.map((column) =>
    /**
     * If the column is the entity label column, add the word "label" to the
     * column title. Otherwise we'd end up with an "Entity" or "Page" column title,
     * making it harder to distinguish from the property/outgoing link columns.
     */
    column.id === "entityLabel" ? `${column.title} label` : column.title,
  );

  const content: string[][] = [
    tableContentColumnTitles,
    ...rows.map((row) =>
      columnRowKeys.map((key) => {
        const resolved = resolveCell?.(key, row);
        if (resolved !== undefined) {
          return resolved;
        }

        const value = row[key as keyof R];

        if (typeof value === "string") {
          return value;
        } else if (key === "lastEditedBy" || key === "createdBy") {
          return (
            (value as { displayName?: string } | undefined)?.displayName ?? ""
          );
        } else if (key === "archived") {
          return value ? "Yes" : "No";
        } else if (key === "sourceEntity" || key === "targetEntity") {
          return (value as { label: string } | undefined)?.label ?? "";
        } else if (key === "entityTypes") {
          return (value as { title: string }[])
            .map((type) => type.title)
            .join(", ");
        } else {
          return stringifyPropertyValue(value);
        }
      }),
    ),
  ];

  return { title, content };
};
