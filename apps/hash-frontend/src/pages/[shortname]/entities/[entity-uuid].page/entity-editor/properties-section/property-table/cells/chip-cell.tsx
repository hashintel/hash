import { faAsterisk, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import type { CustomIcon } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-sprites";
import { Chip, ChipProps, FontAwesomeIcon } from "@hashintel/design-system";
import { customColors } from "@hashintel/design-system/src/theme/palette";
import { Box } from "@mui/material";

import { drawCellFadeOutGradient } from "../../../../../../../../components/grid/utils/draw-cell-fade-out-gradient";
import { drawChipWithIcon } from "../../../../../../../../components/grid/utils/draw-chip-with-icon";

export interface ChipCellProps {
  readonly kind: "chip-cell";
  chips: {
    text: string;
    icon?: CustomIcon;
    faIconDefinition?: Pick<IconDefinition, "icon">;
  }[];
  color?: ChipProps["color"];
  variant?: ChipProps["variant"];
}

export type ChipCell = CustomCell<ChipCellProps>;

export const getChipColors = (
  color: ChipProps["color"],
  variant: ChipProps["variant"] = "filled",
) => {
  const isOutlined = variant === "outlined";
  switch (color) {
    case "blue":
      return {
        textColor: customColors.blue[70],
        bgColor: isOutlined ? customColors.blue[10] : customColors.blue[20],
        borderColor: isOutlined ? customColors.blue[30] : "white",
      };

    default:
      return {};
  }
};

export const renderChipCell: CustomRenderer<ChipCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ChipCell =>
    (cell.data as any).kind === "chip-cell",
  draw: (args, cell) => {
    const { theme, rect } = args;
    const { chips, color = "gray", variant } = cell.data;

    const chipGap = 8;
    let chipLeft = rect.x + theme.cellHorizontalPadding;

    const { bgColor, textColor, borderColor } = getChipColors(color, variant);
    for (let i = 0; i < chips.length; i++) {
      const { icon, text = "" } = chips[i] ?? {};
      const chipWidth = drawChipWithIcon({
        args,
        text,
        left: chipLeft,
        textColor,
        bgColor,
        icon,
        borderColor,
      });

      chipLeft += chipWidth + chipGap;
    }

    drawCellFadeOutGradient(args);
  },
  provideEditor: (cell) => {
    const { chips, color = "gray", variant } = cell.data;

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
            {chips.map(({ text, faIconDefinition }) => (
              <Chip
                key={text}
                label={text}
                color={color}
                variant={variant}
                icon={<FontAwesomeIcon icon={faIconDefinition ?? faAsterisk} />}
              />
            ))}
          </Box>
        );
      },
    };
  },
};
