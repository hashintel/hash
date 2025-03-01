import type { ClosedDataType } from "@blockprotocol/type-system";
import type {
  CustomCell,
  CustomRenderer,
  DataEditorRef,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/design-system/theme";
import { getMergedDataTypeSchema } from "@local/hash-isomorphic-utils/data-types";
import produce from "immer";
import type { RefObject } from "react";

import { getYCenter } from "../../../../../../../components/grid/utils";
import { drawCellFadeOutGradient } from "../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { drawChip } from "../../../../../../../components/grid/utils/draw-chip";
import { drawChipWithIcon } from "../../../../../../../components/grid/utils/draw-chip-with-icon";
import { propertyGridIndexes } from "../constants";
import type { PropertyRow } from "../types";
import { getEditorSpecs } from "./value-cell/editor-specs";
import type { ValueCell } from "./value-cell/types";

export interface ChangeTypeCellProps {
  readonly kind: "change-type-cell";
  currentType: ClosedDataType;
  propertyRow: PropertyRow;
  valueCellOfThisRow: ValueCell;
}

export type ChangeTypeCell = CustomCell<ChangeTypeCellProps>;

const changeTextGap = 8;
const iconGap = 4;
const iconSize = 11;
const chipPadding = 12;
const changeText = "CHANGE";
const changeTextFont = "700 11px Inter";

export const createRenderChangeTypeCell = (
  gridRef: RefObject<DataEditorRef | null>,
): CustomRenderer<ChangeTypeCell> => {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell: CustomCell): cell is ChangeTypeCell =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cell.data as any).kind === "change-type-cell",
    draw: (args, cell) => {
      const { theme, rect, ctx, spriteManager } = args;
      const { currentType } = cell.data;
      const yCenter = getYCenter(args);

      const chipLeft = rect.x + theme.cellHorizontalPadding;

      ctx.font = changeTextFont;
      const changeTextWidth = ctx.measureText(changeText).width;

      const schema = getMergedDataTypeSchema(currentType);

      if ("anyOf" in schema) {
        /**
         * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
         */
        throw new Error(
          "Data types with different expected sets of constraints (anyOf) are not yet supported",
        );
      }

      const editorSpec = getEditorSpecs(currentType, schema);

      const drawTheLeftChip = () =>
        drawChipWithIcon({
          args,
          text: currentType.title,
          left: chipLeft,
          color: "blue",
          icon: { inbuiltIcon: editorSpec.gridIcon },
        });

      const { width: chipWidth } = drawTheLeftChip();

      const changeTextLeft = chipLeft + chipWidth + changeTextGap;

      const mergedChipWidth =
        chipWidth +
        changeTextGap +
        changeTextWidth +
        iconGap +
        iconSize +
        chipPadding;

      drawChip(args, chipLeft, mergedChipWidth, customColors.gray[10]);

      drawTheLeftChip();

      ctx.font = changeTextFont;
      ctx.fillStyle = theme.textBubble;
      ctx.fillText(changeText, changeTextLeft, yCenter);

      spriteManager.drawSprite(
        "bpRightLeft",
        "normal",
        ctx,
        changeTextLeft + changeTextWidth + iconGap,
        yCenter - iconSize / 2,
        iconSize,
        { ...theme, fgIconHeader: theme.textBubble },
      );

      drawCellFadeOutGradient(args);
    },
    onClick: (args) => {
      const { valueCellOfThisRow } = args.cell.data;

      const [_, rowIndex] = args.location;

      const valueCellColumnIndex = propertyGridIndexes.findIndex(
        (val) => val === "value",
      );

      const newContent = produce(valueCellOfThisRow, (draft) => {
        draft.data.showTypePicker = true;
      });

      /**
       * by using `setOverlaySimple`, we can open grid's editor overlay on any cell with any content
       * here, we use this flexibility to open value cell with empty value, so it shows type picker
       */
      gridRef.current?.setOverlaySimple({
        cell: [valueCellColumnIndex, rowIndex],
        forceEditMode: false,
        highlight: false,
        target: gridRef.current.getBounds(valueCellColumnIndex, rowIndex)!,
        initialValue: undefined,
        content: newContent,
      });

      return undefined;
    },
  };
};
