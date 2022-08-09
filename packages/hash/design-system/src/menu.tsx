import { FunctionComponent } from "react";
import { Menu as Muimenu, MenuProps } from "@mui/material";
import { useScrollLock } from "./use-scroll-lock";

/**
 * Custom Popover re-implementing MUI's troublesome scroll-lock mechanism.
 */
export const Menu: FunctionComponent<MenuProps> = ({
  disableScrollLock = false,
  ...props
}) => {
  useScrollLock(!disableScrollLock && props.open);
  return <Muimenu disableScrollLock {...props} />;
};
