import type { Item } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { useTheme } from "@mui/material";
import { useCallback } from "react";

import type { ChipCell } from "../../../../../../../shared/chip-cell";
import { useEntityEditor } from "../../entity-editor-context";
import type { SummaryChipCell } from "../../shared/summary-chip-cell";
import type { LinkCell } from "./cells/link-cell";
import type { LinkedWithCell } from "./cells/linked-with-cell";
import { linkGridIndexes } from "./constants";
import type { LinkRow } from "./types";

export const useCreateGetCellContent = () => {
  const { readonly } = useEntityEditor();

  const theme = useTheme();

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

        const expectsAnything = !row.expectedEntityTypes.length;

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
              allowOverlay: true,
              /** @todo add copy data */
              copyData: "",
              cursor: readonly ? "default" : "pointer",
              data: {
                kind: "linked-with-cell",
                linkRow: row,
                readonly,
              },
            };
          case "expectedEntityTypes": {
            const expectedEntityTypeTitles = row.expectedEntityTypes.map(
              (type) => type.title,
            );
            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: true, // in case we have so many expected types that we need to open on click to see them all
              copyData: String(expectedEntityTypeTitles.join(", ")),
              data: {
                kind: "chip-cell",
                chips: expectsAnything
                  ? [{ text: "Anything" }]
                  : row.expectedEntityTypes.map(({ title, icon }) => ({
                      text: title,
                      icon: icon
                        ? { entityTypeIcon: icon }
                        : {
                            inbuiltIcon: "bpAsterisk",
                          },
                      iconFill: theme.palette.blue[70],
                    })),
                color: expectsAnything ? "blue" : "white",
              },
            };
          }
        }
      },
    [readonly, theme],
  );

  return createGetCellContent;
};
