import { FunctionComponent } from "react";
import { Menu as Muimenu, MenuProps } from "@mui/material";

/**
 * Custom Popover re-implementing MUI's troublesome scroll-lock mechanism.
 */
export const Menu: FunctionComponent<MenuProps> = ({ ...props }) => {
  return <Muimenu {...props} />;
};
