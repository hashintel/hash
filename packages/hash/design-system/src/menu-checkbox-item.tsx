import { Checkbox, ListItemIcon } from "@mui/material";
import * as React from "react";
import { MenuItem, MenuItemProps } from "./menu-item";

export type MenuCheckboxItemProps = {
  children?: React.ReactNode;
} & Omit<MenuItemProps, "noSelectBackground">;

const MenuCheckboxItem: React.ForwardRefRenderFunction<
  HTMLLIElement,
  MenuCheckboxItemProps
> = ({ selected, children, ...props }, ref) => {
  return (
    <MenuItem ref={ref} {...props} noSelectBackground>
      <ListItemIcon>
        <Checkbox checked={selected} />
      </ListItemIcon>
      {children}
    </MenuItem>
  );
};

const MenuCheckboxItemForwardRef = React.forwardRef(MenuCheckboxItem);

export { MenuCheckboxItemForwardRef as MenuCheckboxItem };
