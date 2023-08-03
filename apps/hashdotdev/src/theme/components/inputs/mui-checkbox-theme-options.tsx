import { Box, Components, Theme } from "@mui/material";

import { FaIcon } from "../../../components/icons/fa-icon";

export const MuiCheckboxThemeOptions: Components<Theme>["MuiCheckbox"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
    icon: (
      <Box>
        <FaIcon
          name="square"
          type="regular"
          sx={{ color: ({ palette }) => palette.gray[50], fontSize: 14 }}
        />
      </Box>
    ),
    checkedIcon: (
      <Box>
        <FaIcon
          name="square-check"
          type="regular"
          sx={{ color: ({ palette }) => palette.common.black, fontSize: 14 }}
        />
      </Box>
    ),
  },
  styleOverrides: {
    root: ({ theme }) => ({
      padding: theme.spacing(0.5),
    }),
  },
};
