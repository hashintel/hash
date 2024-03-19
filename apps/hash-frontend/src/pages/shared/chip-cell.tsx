import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { Chip, FontAwesomeIcon } from "@hashintel/design-system";
import { customColors } from "@hashintel/design-system/theme";
import { Box } from "@mui/material";

import type { CustomIcon } from "../../components/grid/utils/custom-grid-icons";
import { drawCellFadeOutGradient } from "../../components/grid/utils/draw-cell-fade-out-gradient";
import { drawChipWithIcon } from "../../components/grid/utils/draw-chip-with-icon";

export type ChipCellColor = "blue" | "gray" | "white";
export type ChipCellVariant = "outlined" | "filled";

export interface ChipCellProps {
  readonly kind: "chip-cell";
  chips: {
    text: string;
    icon?: CustomIcon;
    faIconDefinition?: Pick<IconDefinition, "icon">;
  }[];
  color?: ChipCellColor;
  variant?: ChipCellVariant;
}

export type ChipCell = CustomCell<ChipCellProps>;

export const getChipColors = (
  color: ChipCellColor,
  variant: ChipCellVariant = "filled",
): {
  textColor: string;
  bgColor: string;
  borderColor: string;
  iconColor: string;
} => {
  const isOutlined = variant === "outlined";
  switch (color) {
    case "blue":
      return {
        textColor: customColors.blue[70],
        bgColor: isOutlined ? customColors.blue[10] : customColors.blue[20],
        borderColor: isOutlined ? customColors.blue[30] : customColors.blue[20],
        iconColor: customColors.blue[70],
      };

    case "gray":
      return {
        textColor: customColors.gray[70],
        bgColor: customColors.gray[10],
        borderColor: customColors.gray[20],
        iconColor: customColors.gray[70],
      };

    default:
      return {
        textColor: customColors.gray[80],
        bgColor: customColors.white,
        borderColor: customColors.gray[20],
        iconColor: customColors.blue[70],
      };
  }
};

export const renderChipCell: CustomRenderer<ChipCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ChipCell =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cell.data as any).kind === "chip-cell",
  draw: (args, cell) => {
    const { theme, rect } = args;
    const { chips, color = "gray", variant } = cell.data;

    const chipGap = 8;
    let chipLeft = rect.x + theme.cellHorizontalPadding;

    for (let i = 0; i < chips.length; i++) {
      const { icon, text = "" } = chips[i] ?? {};
      const chipWidth = drawChipWithIcon({
        args,
        color,
        text,
        left: chipLeft,
        icon,
        variant,
      });

      chipLeft += chipWidth + chipGap;
    }

    drawCellFadeOutGradient(args);
  },
  provideEditor: (cell) => {
    const { chips, color, variant } = cell.data;

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
                color={color === "white" ? "gray" : color}
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
