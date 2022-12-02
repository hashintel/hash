import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { ChipCellProps } from "../../properties-section/property-table/cells/chip-cell";
import { LinkCellProps } from "./cells/link-cell";
import { LinkedWithCellProps } from "./cells/linked-with-cell";
import { linkGridIndexes } from "./constants";
import { LinkRow } from "./types";
import { SummaryChipCellProps } from "../../properties-section/property-table/cells/summary-chip-cell";

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
              copyData: linkRow.linkTitle,
              data: {
                kind: "link-cell",
                linkRow,
              } satisfies LinkCellProps,
            };
          case "linkedWith":
            if (linkRow.maxItems > 1) {
              let secondaryText = "No entities";
              const count = linkRow.linkAndTargetEntities.length;

              if (count) {
                secondaryText = `${count} ${count > 1 ? "entities" : "entity"}`;
              }

              return {
                kind: GridCellKind.Custom,
                allowOverlay: false,
                copyData: "",
                data: {
                  kind: "summary-chip-cell",
                  secondaryText,
                } satisfies SummaryChipCellProps,
              };
            }

            return {
              kind: GridCellKind.Custom,
              readonly: true,
              allowOverlay: true,
              /** @todo add copy data */
              copyData: "",
              data: {
                kind: "linked-with-cell",
                linkRow,
              } satisfies LinkedWithCellProps,
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
              } satisfies ChipCellProps,
            };
        }
      },
    [],
  );

  return createGetCellContent;
};
