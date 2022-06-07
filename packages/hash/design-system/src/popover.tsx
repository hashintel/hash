import { Popover as MuiPopover, PopoverProps } from "@mui/material";
import React from "react";
import { useScrollLock } from "./use-scroll-lock";

/**
 * Custom Popover re-implementing MUI's troublesome scroll-lock mechanism.
 */
export const Popover: React.FC<PopoverProps> = ({
  disableScrollLock = false,
  ...props
}) => {
  useScrollLock(!disableScrollLock && props.open);
  return <MuiPopover disableScrollLock {...props} />;
};
