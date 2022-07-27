/* eslint-disable-next-line -- allow import of original popover to extend it */
import { Menu as Muimenu, MenuProps } from "@mui/material";
import React from "react";
import { useScrollLock } from "./use-scroll-lock";

/**
 * Custom Popover re-implementing MUI's troublesome scroll-lock mechanism.
 */
export const Menu: React.FC<MenuProps> = ({
  disableScrollLock = false,
  ...props
}) => {
  useScrollLock(!disableScrollLock && props.open);
  return <Muimenu disableScrollLock {...props} />;
};
