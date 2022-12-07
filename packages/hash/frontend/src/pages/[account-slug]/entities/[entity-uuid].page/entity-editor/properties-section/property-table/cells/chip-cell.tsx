import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import {
  Chip,
  ChipProps,
  FontAwesomeIcon,
} from "@hashintel/hash-design-system";
import { customColors } from "@hashintel/hash-design-system/src/theme/palette";
import { Box } from "@mui/material";

import { drawCellFadeOutGradient } from "../../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { drawChipWithIcon } from "../../../../../../../../components/grid/utils/draw-chip-with-icon";

export interface ChipCellProps {
  readonly kind: "chip-cell";
  chips: string[];
  color?: ChipProps["color"];
}

export type ChipCell = CustomCell<ChipCellProps>;

const getChipColors = (color: ChipProps["color"]) => {
  switch (color) {
    case "blue":
      return {
        textColor: customColors.blue[70],
        bgColor: customColors.blue[20],
      };

    default:
      return { textColor: undefined, bgColor: undefined };
  }
};

export const renderChipCell: CustomRenderer<ChipCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ChipCell =>
    (cell.data as any).kind === "chip-cell",
  draw: (args, cell) => {
    const { theme, rect } = args;
    const { chips, color = "gray" } = cell.data;

    const chipGap = 8;
    let chipLeft = rect.x + theme.cellHorizontalPadding;

    const { bgColor, textColor } = getChipColors(color);
    for (let i = 0; i < chips.length; i++) {
      const chipWidth = drawChipWithIcon(
        args,
        chips[i] ?? "",
        chipLeft,
        textColor,
        bgColor,
      );

      chipLeft += chipWidth + chipGap;
    }

    drawCellFadeOutGradient(args);
  },
  provideEditor: (cell) => {
    const { chips, color = "gray" } = cell.data;

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
            {chips.map((chip) => (
              <Chip
                key={chip}
                label={chip}
                color={color}
                icon={<FontAwesomeIcon icon={faAsterisk} />}
              />
            ))}
          </Box>
        );
      },
    };
  },
};
