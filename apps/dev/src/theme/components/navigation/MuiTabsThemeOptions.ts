/**
 * @todo update from blockprotocol
 */
import { Components } from "@mui/material";

export const MuiTabsThemeOptions: Components["MuiTabs"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    indicator: {
      height: 5,
    },
  },
};
