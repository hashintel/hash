import {
  CustomCell,
  CustomRenderer,
  DataEditorRef,
  GridCellKind,
  Item,
} from "@glideapps/glide-data-grid";
import { customColors } from "@hashintel/design-system";
import produce from "immer";
import { RefObject } from "react";

import { getYCenter } from "../../../../../../../../components/grid/utils";
import { drawCellFadeOutGradient } from "../../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { drawChip } from "../../../../../../../../components/grid/utils/draw-chip";
import { drawChipWithIcon } from "../../../../../../../../components/grid/utils/draw-chip-with-icon";
import { propertyGridIndexes } from "../constants";
import { PropertyRow } from "../types";
import { getChipColors } from "./chip-cell";
import { editorSpecs } from "./value-cell/editor-specs";
import { ValueCell } from "./value-cell/types";
import { guessEditorTypeFromExpectedType } from "./value-cell/utils";

export interface ChangeTypeCellProps {
  readonly kind: "change-type-cell";
  currentType: string;
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
  gridRef: RefObject<DataEditorRef>,
): CustomRenderer<ChangeTypeCell> => {
  return {
    kind: GridCellKind.Custom,
    isMatch: (cell: CustomCell): cell is ChangeTypeCell =>
      (cell.data as any).kind === "change-type-cell",
    draw: (args, cell) => {
      const { theme, rect, ctx, spriteManager } = args;
      const { currentType } = cell.data;
      const yCenter = getYCenter(args);

      const chipLeft = rect.x + theme.cellHorizontalPadding;

      const { bgColor, textColor } = getChipColors("blue");

      ctx.font = changeTextFont;
      const changeTextWidth = ctx.measureText(changeText).width;

      const editorSpec =
        editorSpecs[guessEditorTypeFromExpectedType(currentType)];

      const drawTheLeftChip = () =>
        drawChipWithIcon({
          args,
          text: currentType,
          left: chipLeft,
          textColor,
          bgColor,
          icon: editorSpec.gridIcon,
        });

      const chipWidth = drawTheLeftChip();

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

      const [_, rowIndex] = (args as unknown as { location: Item }).location;

      const valueCellColumnIndex = propertyGridIndexes.findIndex(
        (val) => val === "value",
      );

      const newContent = produce(valueCellOfThisRow, (draft) => {
        draft.data.propertyRow.value = undefined;
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
