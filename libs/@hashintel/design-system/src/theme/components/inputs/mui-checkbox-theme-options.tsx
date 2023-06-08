import { Components, svgIconClasses, Theme } from "@mui/material";

import { CheckboxBlankIcon } from "./mui-checkbox-theme-options/checkbox-blank-icon";
import { CheckboxIcon } from "./mui-checkbox-theme-options/checkbox-icon";

const focusBorderOffset = 4;
const focusBorderWidth = 2;
const checkboxBorderRadius = 3;

export const MuiCheckboxThemeOptions: Components<Theme>["MuiCheckbox"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
    icon: <CheckboxBlankIcon />,
    checkedIcon: <CheckboxIcon />,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      padding: 0,

      [`.${svgIconClasses.root}`]: {
        position: "relative",
      },

      [`&.Mui-focusVisible:after, &:focus-visible:after`]: {
        content: `""`,
        border: "2px solid red",
        position: "absolute",
        top: -focusBorderOffset,
        left: -focusBorderOffset,
        right: -focusBorderOffset,
        bottom: -focusBorderOffset,
        borderWidth: focusBorderWidth,
        borderColor: theme.palette.blue[70],
        borderRadius: checkboxBorderRadius + focusBorderOffset,
      },
    }),
  },
};
