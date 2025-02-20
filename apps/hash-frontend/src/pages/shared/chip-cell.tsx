import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { Chip, FontAwesomeIcon } from "@hashintel/design-system";
import { customColors } from "@hashintel/design-system/theme";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { Box } from "@mui/material";

import { getCellHorizontalPadding } from "../../components/grid/utils";
import { drawCellFadeOutGradient } from "../../components/grid/utils/draw-cell-fade-out-gradient";
import type { DrawChipWithIconProps } from "../../components/grid/utils/draw-chip-with-icon";
import { drawChipWithIcon } from "../../components/grid/utils/draw-chip-with-icon";
import { InteractableManager } from "../../components/grid/utils/interactable-manager";
import type { Interactable } from "../../components/grid/utils/interactable-manager/types";

export type ChipCellColor = "blue" | "gray" | "white";
export type ChipCellVariant = "outlined" | "filled";

export interface ChipCellProps {
  readonly kind: "chip-cell";
  chips: {
    text: string;
    icon?: DrawChipWithIconProps["icon"];
    iconFill?: DrawChipWithIconProps["iconFill"];
    onClick?: () => void;
    faIconDefinition?: Pick<IconDefinition, "icon">;
    suffix?: string;
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

export const createRenderChipCell = (params?: {
  firstColumnLeftPadding?: number;
}): CustomRenderer<ChipCell> => ({
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ChipCell =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cell.data as any).kind === "chip-cell",
  draw: (args, cell) => {
    const { theme, rect, ctx } = args;
    const { chips, color = "gray", variant } = cell.data;

    const chipGap = 8;

    const columnPadding =
      typeof params?.firstColumnLeftPadding !== "undefined" && args.col === 1
        ? params.firstColumnLeftPadding
        : getCellHorizontalPadding();

    let chipLeft = rect.x + columnPadding;

    const interactables: Interactable[] = [];

    for (let i = 0; i < chips.length; i++) {
      const { icon, iconFill, text = "", suffix, onClick } = chips[i] ?? {};

      const { width, height, top } = drawChipWithIcon({
        args,
        color,
        text,
        suffix,
        left: chipLeft,
        icon,
        iconFill,
        variant,
      });

      if (onClick) {
        const arrowSpacing = 4;
        const arrowLeft = chipLeft + width + arrowSpacing;
        const arrowSize = 12;

        args.spriteManager.drawSprite(
          "arrowUpRightRegular",
          "normal",
          ctx,
          arrowLeft,
          top + 6,
          12,
          {
            ...theme,
            bgIconHeader: "white",
            fgIconHeader: customColors.blue[70],
          },
        );

        interactables.push(
          InteractableManager.createCellInteractable(args, {
            id: generateUuid(),
            posRelativeToVisibleGridArea: {
              left: chipLeft,
              right: chipLeft + width + arrowSize + arrowSpacing,
              top,
              bottom: top + height,
            },
            onClick,
          }),
        );

        chipLeft += arrowSpacing + arrowSize;
      }

      chipLeft += chipGap + width;
    }

    InteractableManager.setInteractablesForCell(args, interactables);

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
});
