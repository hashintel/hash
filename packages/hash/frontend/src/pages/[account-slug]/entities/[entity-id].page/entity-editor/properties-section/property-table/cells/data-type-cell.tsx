import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { Chip, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box } from "@mui/material";
import { CustomGridIcon } from "../../../../../../../../components/GlideGlid/custom-grid-icons";
import { drawCellFadeOutGradient } from "../../../../../../../../components/GlideGlid/draw-cell-fade-out-gradient";
import { roundRect } from "../../../../../../../../components/GlideGlid/utils";
import { PropertyRow } from "../types";

export interface DataTypeCellProps {
  readonly kind: "data-type-cell";
  property: PropertyRow;
}

export type DataTypeCell = CustomCell<DataTypeCellProps>;

const drawChip = (
  args: DrawArgs<DataTypeCell>,
  dataType: string,
  left: number,
) => {
  const { ctx, rect, theme } = args;
  const yCenter = rect.y + rect.height / 2 + 2;

  const height = 26;
  const chipTop = yCenter - height / 2;
  const paddingX = 12;
  const iconSize = 10;
  const gap = 6;

  const iconLeft = left + paddingX;
  const textLeft = iconLeft + iconSize + gap;

  const textWidth = ctx.measureText(dataType).width;
  const chipWidth = iconSize + gap + textWidth + 2 * paddingX;

  ctx.fillStyle = theme.bgBubble;
  ctx.beginPath();
  roundRect(ctx, left, chipTop, chipWidth, height, height / 2, true, false);
  ctx.fill();

  args.spriteManager.drawSprite(
    CustomGridIcon.ASTERISK,
    "normal",
    ctx,
    iconLeft,
    yCenter - iconSize / 2,
    iconSize,
    theme,
  );

  ctx.fillStyle = theme.textBubble;
  ctx.fillText(dataType, textLeft, yCenter);

  return chipWidth;
};

export const renderDataTypeCell: CustomRenderer<DataTypeCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is DataTypeCell =>
    (cell.data as any).kind === "data-type-cell",
  draw: (args, cell) => {
    const { ctx, theme, rect } = args;
    const { dataTypes } = cell.data.property;

    ctx.fillStyle = theme.textHeader;

    const chipGap = 8;
    let chipLeft = rect.x + theme.cellHorizontalPadding;

    for (let i = 0; i < dataTypes.length; i++) {
      const dataType = dataTypes[i] ?? "";

      const chipWidth = drawChip(args, dataType, chipLeft);

      chipLeft += chipWidth + chipGap;
    }

    drawCellFadeOutGradient(args);
  },
  provideEditor: (cell) => {
    const { dataTypes } = cell.data.property;

    return {
      disablePadding: true,
      editor: (props) => {
        return (
          <Box
            sx={{
              display: "flex",
              gap: 1,
              p: 1,
              width: props.target.width,
              overflow: "scroll",
              "::-webkit-scrollbar": {
                display: "none",
              },
            }}
          >
            {dataTypes.map((type) => (
              <Chip
                key={type}
                label={type}
                icon={<FontAwesomeIcon icon={faAsterisk} />}
              />
            ))}
          </Box>
        );
      },
    };
  },
};
