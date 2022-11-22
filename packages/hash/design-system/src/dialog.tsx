import { FunctionComponent } from "react";
import { Dialog as MuiDialog, DialogProps } from "@mui/material";

/**
 * Custom Popover re-implementing MUI's troublesome scroll-lock mechanism.
 */
export const Dialog: FunctionComponent<DialogProps> = ({ ...props }) => {
  return <MuiDialog {...props} />;
};
