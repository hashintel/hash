import type { Components, Theme } from "@mui/material";

import { SquareCheckRegularIcon } from "../../../components/icons/square-check-regular-icon";
import { SquareRegularIcon } from "../../../components/icons/square-regular-icon";

export const MuiCheckboxThemeOptions: Components<Theme>["MuiCheckbox"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
    icon: (
      <SquareRegularIcon
        sx={{ color: ({ palette }) => palette.gray[50], fontSize: 14 }}
      />
    ),
    checkedIcon: (
      <SquareCheckRegularIcon
        sx={{ color: ({ palette }) => palette.common.black, fontSize: 14 }}
      />
    ),
  },
  styleOverrides: {
    root: ({ theme }) => ({
      padding: theme.spacing(0.5),
    }),
  },
};
