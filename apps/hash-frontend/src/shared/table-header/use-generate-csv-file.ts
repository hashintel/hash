import { useCallback } from "react";

import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { MutableRefObject } from "react";

import type { GridRow } from "../../components/grid/grid";
import type { MinimalUser } from "../../lib/user-and-org";
import type { EntitiesTableRow } from "../../pages/shared/entities-visualizer/types";
import type { TypesTableRow } from "../../pages/shared/types-table";
import type { GenerateCsvFileFunction } from "./export-to-csv-button";

export const useGenerateCsvFile = <R extends GridRow>({
  currentlyDisplayedColumnsRef,
  currentlyDisplayedRowsRef,
  title,
}: {
  currentlyDisplayedColumnsRef: MutableRefObject<SizedGridColumn[] | null>;
  currentlyDisplayedRowsRef: MutableRefObject<R[] | null>;
  title: string;
}): GenerateCsvFileFunction =>
  useCallback(() => {
    const currentlyDisplayedRows = currentlyDisplayedRowsRef.current;
    if (!currentlyDisplayedRows) {
      return null;
    }

    const currentlyDisplayedColumns = currentlyDisplayedColumnsRef.current;
    if (!currentlyDisplayedColumns) {
      return null;
    }

    const columnRowKeys = currentlyDisplayedColumns.map(({ id }) => id).flat();

    const tableContentColumnTitles = currentlyDisplayedColumns.map((column) =>
      column.id === "entityLabel" ? `${column.title} label` : column.title,
    );

    const content: string[][] = [
      tableContentColumnTitles,
      ...currentlyDisplayedRows.map((row) => {
        const tableCells = columnRowKeys.map((key) => {
          const value = row[key as keyof R];

          if (typeof value === "string") {
            return value;
          } else if (key === "lastEditedBy" || key === "createdBy") {
            const user = value as MinimalUser | undefined;
            return user?.displayName ?? "";
          } else if (key === "archived") {
            return (row as unknown as TypesTableRow).archived ? "Yes" : "No";
          } else if (key === "sourceEntity" || key === "targetEntity") {
            return (
              (row as unknown as EntitiesTableRow).sourceEntity?.label ?? ""
            );
          } else if (key === "entityTypes") {
            return (row as unknown as EntitiesTableRow).entityTypes
              .map((type) => type.title)
              .join(", ");
          } else {
            return stringifyPropertyValue(value);
          }
        });
        return tableCells;
      }),
    ];

    return { title, content };
  }, [title, currentlyDisplayedColumnsRef, currentlyDisplayedRowsRef]);
