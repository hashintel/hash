import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { linkGridIndexes } from "./constants";
import { LinkRow } from "./types";

export const useGetCellContent = (rowData: LinkRow[]) => {
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const link = rowData[row];

      if (!link) {
        throw new Error("link not found");
      }

      const linkKey = linkGridIndexes[col];

      if (!linkKey) {
        throw new Error("linkKey not found");
      }

      const value = link[linkKey];

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
      };
    },
    [rowData],
  );

  return getCellContent;
};
