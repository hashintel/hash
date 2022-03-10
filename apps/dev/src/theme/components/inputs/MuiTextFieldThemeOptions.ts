/**
 * @todo update from blockprotocol
 */
import { Components } from "@mui/material";

export const MuiTextFieldThemeOptions: Components["MuiTextField"] = {
  defaultProps: {
    InputLabelProps: {
      disableAnimation: true,
      shrink: true,
    },
    InputProps: {
      notched: false,
    },
  },
};
