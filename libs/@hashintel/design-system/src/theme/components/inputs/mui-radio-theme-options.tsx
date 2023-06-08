import { Components, Theme } from "@mui/material";

import { RadioCheckedIcon } from "./mui-radio-theme-options/radio-checked-icon";
import { RadioUncheckedIcon } from "./mui-radio-theme-options/radio-unchecked-icon";

const focusBorderOffset = 4;
const focusBorderWidth = 2;

export const MuiRadioThemeOptions: Components<Theme>["MuiRadio"] = {
  defaultProps: {
    disableRipple: true,
    disableFocusRipple: true,
    disableTouchRipple: true,
    icon: <RadioUncheckedIcon />,
    checkedIcon: <RadioCheckedIcon />,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      color: theme.palette.gray[40],
      padding: 0,

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
        borderRadius: "50%",
      },
    }),
  },
};
