import type { SxProps, Theme } from "@mui/material";

import type { SimpleStatus } from "../../../../../shared/flow-runs-context";

const redStyles: SxProps<Theme> = {
  borderColor: ({ palette }) => palette.red[30],
  darkBackground: ({ palette }) => palette.red[70],
  lightBackground: ({ palette }) => palette.red[20],
  lightestBackground: ({ palette }) => palette.red[10],
  text: ({ palette }) => palette.red[100],
};

export const statusSx = {
  Complete: {
    borderColor: ({ palette }) => palette.green[30],
    darkBackground: ({ palette }) => palette.green[70],
    lightBackground: ({ palette }) => palette.green[20],
    lightestBackground: ({ palette }) => palette.green[10],
    text: ({ palette }) => palette.green[100],
  },
  "In Progress": {
    borderColor: ({ palette }) => palette.blue[30],
    darkBackground: ({ palette }) => palette.blue[70],
    lightBackground: ({ palette }) => palette.blue[20],
    lightestBackground: ({ palette }) => palette.blue[10],
    text: ({ palette }) => palette.blue[100],
  },
  Cancelled: redStyles,
  Errored: redStyles,
  Waiting: {
    borderColor: ({ palette }) => palette.gray[30],
    darkBackground: ({ palette }) => palette.gray[30],
    lightBackground: ({ palette }) => palette.gray[20],
    lightestBackground: ({ palette }) => palette.gray[10],
    text: ({ palette }) => palette.common.black,
  },
  "Information Required": {
    borderColor: ({ palette }) => palette.yellow[40],
    darkBackground: ({ palette }) => palette.yellow[80],
    lightBackground: ({ palette }) => palette.yellow[30],
    lightestBackground: ({ palette }) => palette.yellow[10],
    text: ({ palette }) => palette.yellow[100],
  },
} as const satisfies Record<SimpleStatus, SxProps<Theme>>;
