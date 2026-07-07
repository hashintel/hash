import { chipClasses } from "@mui/material";

import type { SxProps, Theme } from "@mui/material";

const basePillSx = {
  height: 26,
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

export const dashedPillSx: SxProps<Theme> = {
  ...basePillSx,
  border: ({ palette }: Theme) => `1px dashed ${palette.gray[30]}`,
};

/**
 * Used for property-filter pills that don't yet contribute a clause (no value
 * or an invalid value) – a muted, placeholder-looking variant.
 */
export const incompletePillSx: SxProps<Theme> = {
  ...basePillSx,
  background: "transparent",
  border: ({ palette }: Theme) => `1px dashed ${palette.gray[40]}`,
  [`.${chipClasses.label}`]: {
    fontSize: 13,
    color: ({ palette }: Theme) => palette.gray[60],
  },
};

export const activePillSx: SxProps<Theme> = {
  height: 26,
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
