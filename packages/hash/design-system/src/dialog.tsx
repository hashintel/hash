/* eslint-disable-next-line -- allow import of original popover to extend it */
import { Dialog as MuiDialog, DialogProps } from "@mui/material";
import React from "react";
import { useScrollLock } from "./use-scroll-lock";

/**
 * Custom Popover re-implementing MUI's troublesome scroll-lock mechanism.
 */
export const Dialog: React.FC<DialogProps> = ({
  disableScrollLock = false,
  ...props
}) => {
  useScrollLock(!disableScrollLock && props.open);
  return <MuiDialog disableScrollLock {...props} />;
};
