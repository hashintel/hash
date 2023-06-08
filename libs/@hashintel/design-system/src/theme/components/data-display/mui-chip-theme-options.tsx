import { faClose } from "@fortawesome/free-solid-svg-icons";
import { Box, ChipProps, Components, PaletteValue, Theme } from "@mui/material";

import { FontAwesomeIcon } from "../../../fontawesome-icon";

const getColors = (
  theme: Theme,
  color: Exclude<ChipProps["color"], "default" | undefined> = "gray",
  variant: Exclude<ChipProps["variant"], undefined> = "filled",
) => {
  let textColorShade;
  let bgColorShade;
  let textHoverColorShade;
  let bgHoverColorShade;
  let outlineColorShade: number | undefined = undefined;
  let outlineHoverColorShade: number | undefined = undefined;

  // For most colors, on hover, we increase the shade
  // of text color and bg color by 10
  switch (color) {
    case "yellow":
      bgColorShade = 30;
      bgHoverColorShade = bgColorShade + 10;
      textColorShade = 90;
      textHoverColorShade = textColorShade + 10;
      break;
    case "navy":
      bgColorShade = 20;
      bgHoverColorShade = bgColorShade + 10;
      textColorShade = 70;
      textHoverColorShade = 90;
      break;
    case "red":
    case "pink":
      bgColorShade = 20;
      bgHoverColorShade = bgColorShade + 10;
      textColorShade = 90;
      textHoverColorShade = textColorShade + 10;
      break;
    case "blue":
    case "purple":
    case "orange":
    case "mint":
    case "teal":
    default:
      bgColorShade = 20;
      bgHoverColorShade = bgColorShade + 10;
      textColorShade = 80;
      textHoverColorShade = textColorShade + 10;
      break;
  }

  // if it's an outlined variant,
  // 1. we set outline color to initial bgColorShade + 10
  // 2. we set outline hover color to outline color (set above) + 10
  // 3. we reduce all other shades by 10
  if (variant === "outlined") {
    outlineColorShade = bgColorShade + 10;
    outlineHoverColorShade = outlineColorShade + 10;
    textColorShade -= 10;
    bgColorShade -= 10;
    textHoverColorShade -= 10;
    bgHoverColorShade -= 10;
  }

  return {
    textColor: theme.palette[color][textColorShade as keyof PaletteValue],
    bgColor: theme.palette[color][bgColorShade as keyof PaletteValue],
    textHoverColor:
      theme.palette[color][textHoverColorShade as keyof PaletteValue],
    bgHoverColor: theme.palette[color][bgHoverColorShade as keyof PaletteValue],
    outlineColor: outlineColorShade
      ? theme.palette[color][bgHoverColorShade as keyof PaletteValue]
      : undefined,
    outlineHoverColor: outlineHoverColorShade
      ? theme.palette[color][bgHoverColorShade as keyof PaletteValue]
      : undefined,
  };
};

export const MuiChipThemeOptions: Components<Theme>["MuiChip"] = {
  defaultProps: {
    size: "small",
    deleteIcon: (
      // wrapping the icon in a box makes it possible for us to increase
      // the icons clickable area without increasing the size of the icon
      <Box>
        <FontAwesomeIcon icon={faClose} />
      </Box>
    ),
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => {
      const { color, variant, onClick } = ownerState;

      const {
        textColor,
        bgColor,
        textHoverColor,
        bgHoverColor,
        outlineColor,
        outlineHoverColor,
      } = getColors(theme, color ?? "gray", variant);

      return {
        color: textColor,
        backgroundColor: bgColor,
        height: "unset",

        border: "1px solid white",

        ...(outlineColor && {
          border: `1px solid ${outlineColor}`,
        }),

        // only apply hover ui and show a pointer cursor
        // when the chip is clickable
        ...(onClick
          ? {
              cursor: "pointer",
              "&:hover": {
                color: textHoverColor,
                background: bgHoverColor,
                ...(outlineHoverColor && {
                  border: `1px solid ${outlineHoverColor}`,
                }),
              },
            }
          : {
              cursor: "default !important",
            }),
      };
    },
    label: ({ ownerState, theme }) => {
      const { size = "small" } = ownerState;

      return {
        color: "currentColor",
        ...(size === "xs" && {
          ...theme.typography.microText,
          fontWeight: 500,
          padding: theme.spacing(0.25, 1),
        }),
        // @todo there's no medium size in the design
        // confirm if this is correct.
        // For now reusing the styles for small
        // @see https://www.figma.com/file/gydVGka9FjNEg9E2STwhi2?node-id=841:72304#181234889
        ...(["small", "medium"].includes(size) && {
          ...theme.typography.smallTextLabels,
          fontWeight: 500,
          padding: theme.spacing(0.5, 1.5),
        }),
        ...(size === "large" && {
          ...theme.typography.regularTextLabels,
          fontWeight: 500,
          padding: theme.spacing(0.5, 1.5),
        }),
      };
    },
    icon: ({ ownerState }) => {
      const { size } = ownerState;
      return {
        color: "currentColor",
        fontSize: 12,
        marginLeft: 12,
        marginRight: -6,

        ...(size === "xs" && {
          marginLeft: 8,
          marginRight: -2,
        }),

        ...(size === "large" && {
          fontSize: 16,
        }),
      };
    },
    deleteIcon: ({ ownerState, theme }) => {
      const { size, color } = ownerState;
      const { bgHoverColor } = getColors(theme, color ?? "gray", "filled");

      return {
        color: "currentColor",
        height: 18,
        width: 18,
        fontSize: 12,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 8,
        marginLeft: -8,
        borderRadius: "50%",
        transition: theme.transitions.create("background-color"),
        cursor: "pointer",

        svg: {
          fontSize: "inherit",
        },

        "&:hover": {
          backgroundColor: bgHoverColor,
          borderRadius: "50%",
        },

        ...(size === "xs" && {
          height: 16,
          width: 16,
          marginRight: 6,
          marginLeft: -4,
        }),

        ...(size === "large" && {
          height: 22,
          width: 22,
          fontSize: 16,
          marginLeft: -8,
        }),
      };
    },
  },
};
