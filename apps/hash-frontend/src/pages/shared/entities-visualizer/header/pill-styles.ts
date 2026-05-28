import { chipClasses } from "@mui/material";

import type { SxProps, Theme } from "@mui/material";

export const defaultPillSx: SxProps<Theme> = {
  height: 26,
  borderRadius: "4px",
  cursor: "pointer",
  border: ({ palette }: Theme) => `1px solid ${palette.gray[30]}`,
  background: ({ palette }: Theme) => palette.gray[5],
  [`.${chipClasses.label}`]: {
    fontSize: 13,
    fontWeight: 500,
    color: ({ palette }: Theme) => palette.gray[70],
  },
};

export const activePillSx: SxProps<Theme> = {
  height: 26,
  borderRadius: "4px",
  cursor: "pointer",
  border: ({ palette }: Theme) => `1px solid ${palette.blue[40]}`,
  background: ({ palette }: Theme) => palette.blue[15],
  [`.${chipClasses.label}`]: {
    fontSize: 13,
    fontWeight: 500,
    color: ({ palette }: Theme) => palette.blue[90],
  },
  "&:hover": {
    background: ({ palette }: Theme) => palette.blue[20],
  },
};

export const dashedPillSx: SxProps<Theme> = {
  height: 26,
  borderRadius: "4px",
  cursor: "pointer",
  border: ({ palette }: Theme) => `1px dashed ${palette.gray[30]}`,
  background: ({ palette }: Theme) => palette.gray[5],
  [`.${chipClasses.label}`]: {
    fontSize: 13,
    fontWeight: 500,
    color: ({ palette }: Theme) => palette.gray[70],
  },
};
