import type { SxProps, Theme } from "@mui/material";
import {
  autocompleteClasses,
  menuItemClasses,
  outlinedInputClasses,
} from "@mui/material";

import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../../shared/style-values";

export const inputPropsSx: (props: {
  inputHeight: number;
}) => SxProps<Theme> = ({ inputHeight }) => ({
  height: inputHeight,

  [`&.${outlinedInputClasses.root}`]: {
    padding: "0 !important",
    pl: "10px !important",
  },

  [`.${autocompleteClasses.input}`]: {
    p: "0 8px !important",
    fontSize: 14,
    fontWeight: 400,
  },

  "@media (prefers-color-scheme: dark)": {
    background: darkModeInputBackgroundColor,

    [`.${outlinedInputClasses.notchedOutline}`]: {
      border: `1px solid ${darkModeBorderColor} !important`,
    },

    [`.${outlinedInputClasses.input}`]: {
      color: darkModeInputColor,

      "&::placeholder": {
        color: `${darkModePlaceholderColor} !important`,
      },
    },
  },
});

export const menuItemSx: SxProps<Theme> = ({ palette }) => ({
  minHeight: 0,
  p: 0,
  borderBottom: `1px solid ${palette.gray[20]}`,
  [`&.${autocompleteClasses.option}`]: {
    minHeight: 0,
    py: 0.8,
    px: 0.8,
  },

  "&:active": {
    color: "inherit",
  },

  "@media (prefers-color-scheme: dark)": {
    borderBottom: `1px solid ${darkModeBorderColor}`,

    "&:hover": {
      background: darkModeInputBackgroundColor,
    },

    [`&.${menuItemClasses.root}&.${autocompleteClasses.option}`]: {
      borderRadius: 0,
      my: 0.25,

      [`&[aria-selected="true"]`]: {
        backgroundColor: `${palette.primary.main} !important`,
        color: palette.common.white,
      },

      "&.Mui-focused": {
        backgroundColor: `${palette.common.black} !important`,

        [`&[aria-selected="true"]`]: {
          backgroundColor: `${palette.primary.main} !important`,
        },
      },
    },
  },
});
