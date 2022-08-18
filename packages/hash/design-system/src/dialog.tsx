import { FunctionComponent } from "react";
import { Dialog as MuiDialog, DialogProps } from "@mui/material";
import { useScrollLock } from "./use-scroll-lock";

/**
 * Custom Popover re-implementing MUI's troublesome scroll-lock mechanism.
 */
export const Dialog: FunctionComponent<DialogProps> = ({
  disableScrollLock = false,
  ...props
}) => {
  useScrollLock(!disableScrollLock && props.open);
  return <MuiDialog disableScrollLock {...props} />;
};
