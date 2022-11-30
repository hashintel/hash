import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { ChipCellProps } from "../../properties-section/property-table/cells/chip-cell";
import { LinkCellProps } from "./cells/link-cell";
import { linkGridIndexes } from "./constants";
import { LinkRow } from "./types";

export const useCreateGetCellContent = () => {
  const createGetCellContent = useCallback(
    (rows: LinkRow[]) =>
      ([col, row]: Item): GridCell => {
        const linkRow = rows[row];

        if (!linkRow) {
          throw new Error("link not found");
        }

        const columnKey = linkGridIndexes[col];

        if (!columnKey) {
          throw new Error("columnKey not found");
        }

        switch (columnKey) {
          case "linkTitle":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: String(linkRow.expectedEntityTypes),
              data: {
                kind: "link-cell",
                linkRow,
              } as LinkCellProps,
            };
          case "linkedWith":
            return {
              kind: GridCellKind.Text,
              data: linkRow.linkedWith,
              displayData: linkRow.linkedWith,
              allowOverlay: false,
            };

          case "expectedEntityTypes":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: true,
              copyData: String(linkRow.expectedEntityTypes),
              data: {
                kind: "chip-cell",
                chips: linkRow.expectedEntityTypes,
              } as ChipCellProps,
            };
        }
      },
    [],
  );

  return createGetCellContent;
};
