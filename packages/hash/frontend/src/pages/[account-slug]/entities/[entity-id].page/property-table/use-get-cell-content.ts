import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { gridIndexes } from "./constants";
import { Row } from "./types";

export const useGetCellContent = (rowData: Row[]) => {
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const property = rowData[row];

      if (!property) {
        throw new Error();
      }

      const propertyKey = gridIndexes[col];

      if (!propertyKey) {
        throw new Error();
      }

      const value = property[propertyKey];

      switch (propertyKey) {
        case "title":
          return {
            kind: GridCellKind.Text,
            data: value,
            displayData: value,
            readonly: true,
            allowOverlay: false,
          };

        case "dataTypes":
          return {
            kind: GridCellKind.Bubble,
            data: value,
            allowOverlay: true,
          };

        case "value":
          if (typeof value === "number") {
            return {
              kind: GridCellKind.Number,
              data: value,
              displayData: String(value),
              allowOverlay: true,
              cursor: "pointer",
            };
          }

          if (typeof value === "boolean") {
            return {
              kind: GridCellKind.Boolean,
              data: value,
              allowOverlay: false,
            };
          }

          // everything else renders like Text for now
          return {
            kind: GridCellKind.Text,
            data: value,
            displayData: value,
            allowOverlay: true,
            cursor: "pointer",
          };
      }
    },
    [rowData],
  );

  return getCellContent;
};
