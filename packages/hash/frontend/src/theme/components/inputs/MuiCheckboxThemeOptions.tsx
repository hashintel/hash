import { Components, Theme } from "@mui/material";
import { CheckboxBlankIcon } from "../icons/CheckboxBlankIcon";
import { CheckboxIcon } from "../icons/CheckboxIcon";

export const MuiCheckboxThemeOptions: Components<Theme>["MuiCheckbox"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
    icon: <CheckboxBlankIcon />, // todo-mui fix issue with blank icon
    checkedIcon: <CheckboxIcon />,
  },
  styleOverrides: {
    root: ({ theme }) => ({}),
  },
};
