import { GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";

import { useEntityEditor } from "../../entity-editor-context";
import { ChipCell } from "../../properties-section/property-table/cells/chip-cell";
import { SummaryChipCell } from "../../properties-section/property-table/cells/summary-chip-cell";
import { LinkCell } from "./cells/link-cell";
import { LinkedWithCell } from "./cells/linked-with-cell";
import { linkGridIndexes } from "./constants";
import { LinkRow } from "./types";

export const useCreateGetCellContent = () => {
  const { readonly } = useEntityEditor();

  const createGetCellContent = useCallback(
    (rows: LinkRow[]) =>
      ([colIndex, rowIndex]: Item):
        | LinkCell
        | SummaryChipCell
        | LinkedWithCell
        | ChipCell => {
        const row = rows[rowIndex];

        if (!row) {
          throw new Error("link not found");
        }

        const columnKey = linkGridIndexes[colIndex];

        if (!columnKey) {
          throw new Error("columnKey not found");
        }

        const expectsAnything = !row.expectedEntityTypeTitles.length;

        switch (columnKey) {
          case "linkTitle":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: false,
              copyData: row.linkTitle,
              data: {
                kind: "link-cell",
                linkRow: row,
              },
            };
          case "linkedWith":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: !readonly,
              /** @todo add copy data */
              copyData: "",
              cursor: readonly ? "default" : "pointer",
              data: {
                kind: "linked-with-cell",
                linkRow: row,
                readonly,
              },
            };
          case "expectedEntityTypes":
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: true,
              copyData: String(row.expectedEntityTypeTitles),
              data: {
                kind: "chip-cell",
                chips: expectsAnything
                  ? [{ text: "Anything" }]
                  : row.expectedEntityTypeTitles.map((title) => ({
                      text: title,
                    })),
                color: "blue",
                variant: expectsAnything ? "outlined" : "filled",
              },
            };
        }
      },
    [readonly],
  );

  return createGetCellContent;
};
