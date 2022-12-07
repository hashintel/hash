import { GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { ChipCell } from "../../properties-section/property-table/cells/chip-cell";
import { LinkCell } from "./cells/link-cell";
import { LinkedWithCell } from "./cells/linked-with-cell";
import { linkGridIndexes } from "./constants";
import { LinkRow } from "./types";
import { SummaryChipCell } from "../../properties-section/property-table/cells/summary-chip-cell";

export const useCreateGetCellContent = () => {
  const createGetCellContent = useCallback(
    (rows: LinkRow[]) =>
      ([col, row]: Item):
        | LinkCell
        | SummaryChipCell
        | LinkedWithCell
        | ChipCell => {
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
              copyData: linkRow.linkTitle,
              data: {
                kind: "link-cell",
                linkRow,
              },
            };
          case "linkedWith":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: true,
              /** @todo add copy data */
              copyData: "",
              cursor: "pointer",
              data: {
                kind: "linked-with-cell",
                linkRow,
              },
            };
          case "expectedEntityTypes":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: true,
              copyData: String(linkRow.expectedEntityTypeTitles),
              data: {
                kind: "chip-cell",
                chips: linkRow.expectedEntityTypeTitles,
                color: "blue",
              },
            };
        }
      },
    [],
  );

  return createGetCellContent;
};
