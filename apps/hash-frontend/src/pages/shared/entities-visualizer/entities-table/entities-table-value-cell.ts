import type { PropertyMetadata } from "@blockprotocol/type-system";
import type {
  CustomCell,
  CustomRenderer,
  ProvideEditorComponent,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/design-system/theme";
import type { ClosedMultiEntityTypesDefinitions } from "@local/hash-graph-sdk/ontology";

import {
  getCellHorizontalPadding,
  getYCenter,
} from "../../../../components/grid/utils";
import { drawChipWithText } from "../../../../components/grid/utils/draw-chip-with-text";
import { drawTextWithIcon } from "../../../../components/grid/utils/draw-text-with-icon";
import { formatValue } from "../../format-value";
import { ReadonlyEntitiesTableValueCellPopup } from "./entities-table-value-cell/popup";

export interface EntitiesTableValueCellProps {
  readonly kind: "entities-table-value-cell";
  isArray: boolean;
  value: unknown;
  propertyMetadata: PropertyMetadata;
  dataTypeDefinitions: ClosedMultiEntityTypesDefinitions["dataTypes"];
}

export type EntitiesTableValueCell = CustomCell<EntitiesTableValueCellProps>;

export type EntitiesTableValueCellEditorComponent =
  ProvideEditorComponent<EntitiesTableValueCell>;

export const createRenderEntitiesTableValueCell = ({
  firstColumnLeftPadding,
}: {
  firstColumnLeftPadding: number;
}): CustomRenderer<EntitiesTableValueCell> => ({
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is EntitiesTableValueCell =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cell.data as any).kind === "entities-table-value-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;

    const { isArray, value, propertyMetadata, dataTypeDefinitions } = cell.data;

    ctx.fillStyle = theme.textHeader;
    ctx.font = theme.baseFontStyle;

    const columnPadding =
      typeof firstColumnLeftPadding !== "undefined" && args.col === 1
        ? firstColumnLeftPadding
        : getCellHorizontalPadding();

    const left = rect.x + columnPadding;

    const yCenter = getYCenter(args);

    if (!isArray && typeof value === "object") {
      drawChipWithText({
        args,
        left,
        text: !value ? "null" : JSON.stringify(value),
      });
    } else if (typeof value === "boolean") {
      // draw boolean
      drawTextWithIcon({
        args,
        text: value.toString(),
        icon: value ? "bpCheck" : "bpCross",
        left,
        iconColor: customColors.gray[50],
        iconSize: 16,
      });
    } else {
      const valueParts = formatValue(
        value,
        propertyMetadata,
        dataTypeDefinitions,
      );

      let textOffset = left;
      for (const [index, part] of valueParts.entries()) {
        ctx.fillStyle = part.color;
        ctx.fillText(part.text, textOffset, yCenter);

        const additionalRightPadding =
          part.type === "leftLabel"
            ? 0.5
            : part.type === "value" &&
                valueParts[index + 1]?.type === "rightLabel"
              ? 0.5
              : 0;

        textOffset += ctx.measureText(part.text).width + additionalRightPadding;
      }
    }
  },
  provideEditor: () => {
    return {
      disableStyling: true,
      disablePadding: true,
      editor: ReadonlyEntitiesTableValueCellPopup,
    };
  },
});
