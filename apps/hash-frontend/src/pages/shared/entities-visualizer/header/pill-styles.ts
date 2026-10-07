import { chipClasses } from "@mui/material";

import type { SxProps, Theme } from "@mui/material";

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

export const iconPillSx: SxProps<Theme> = {
  ...basePillSx,
  border: ({ palette }: Theme) => `1px solid ${palette.gray[30]}`,
  width: 30,
  padding: 0,
  display: "inline-flex",
  svg: {
    fontSize: 12,
    color: ({ palette }: Theme) => palette.common.black,
  },
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
