import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { linkGridIndexes } from "./constants";
import { LinkRow } from "./types";

export const useGetCellContent = () => {
  const getCellContent = useCallback(
    (rowData: LinkRow[]) =>
      ([col, row]: Item): GridCell => {
        const link = rowData[row];

        if (!link) {
          throw new Error("link not found");
        }

        const columnKey = linkGridIndexes[col];

        if (!columnKey) {
          throw new Error("columnKey not found");
        }

        const value = link[columnKey];

        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: value,
          allowOverlay: false,
        };
      },
    [],
  );

  return getCellContent;
};
