import { chipClasses } from "@mui/material";

import type { SxProps, Theme } from "@mui/material";

/**
 * The ds `Filter` chips' sm height (14px font × 1.6 line-height + 2 × 2px
 * padding + 2 × 1px border), so the pills level with the chips beside them.
 */
const dsFilterChipHeight = "28.4px";

const basePillSx = {
  height: dsFilterChipHeight,
  borderRadius: "4px",
  background: ({ palette }: Theme) => palette.gray[5],
  [`.${chipClasses.label}`]: {
    fontSize: 13,
    color: ({ palette }: Theme) => palette.gray[70],
  },
} satisfies SxProps<Theme>;

export const defaultPillSx: SxProps<Theme> = {
  ...basePillSx,
  border: ({ palette }: Theme) => `1px solid ${palette.gray[30]}`,
};

/** The default pill chrome, squared up for an icon-only pill button. */
export const iconPillSx: SxProps<Theme> = {
  ...basePillSx,
  border: ({ palette }: Theme) => `1px solid ${palette.gray[30]}`,
  width: 30,
  padding: 0,
  // The theme's IconButton renders block-level (`flex`); inline-flex keeps the
  // pill in the ribbon's inline flow rather than breaking the line around it.
  display: "inline-flex",
  // The theme's IconButton override sizes and colours descendant svgs, so the
  // glyph is set here, where the button-level sx outranks it. Sized to the
  // pills' 12px caret icons so the lone glyph sits balanced.
  svg: {
    fontSize: 12,
    color: ({ palette }: Theme) => palette.common.black,
  },
  // The web/type pills' MUI Chip hover computes to gray[30]; match it.
  "&:hover": {
    background: ({ palette }: Theme) => palette.gray[30],
  },
};

export const activePillSx: SxProps<Theme> = {
  height: dsFilterChipHeight,
  borderRadius: "4px",
  border: ({ palette }: Theme) => `1px solid ${palette.blue[40]}`,
  background: ({ palette }: Theme) => palette.blue[15],
  [`.${chipClasses.label}`]: {
    fontSize: 13,
    color: ({ palette }: Theme) => palette.blue[90],
  },
  "&:hover": {
    background: ({ palette }: Theme) => palette.blue[20],
  },
};
