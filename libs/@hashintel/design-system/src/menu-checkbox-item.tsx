import { Checkbox, ListItemIcon } from "@mui/material";
import { forwardRef } from "react";

import { MenuItem } from "./menu-item";

import type { MenuItemProps } from "./menu-item";
import type { ForwardRefRenderFunction, ReactNode } from "react";

export type MenuCheckboxItemProps = {
  children?: ReactNode;
} & Omit<MenuItemProps, "noSelectBackground">;

const MenuCheckboxItem: ForwardRefRenderFunction<HTMLLIElement, MenuCheckboxItemProps> = (
  { selected, children, ...props },
  ref,
) => {
  return (
    <MenuItem ref={ref} {...props} noSelectBackground>
      <ListItemIcon>
        <Checkbox checked={selected} />
      </ListItemIcon>
      {children}
    </MenuItem>
  );
};

const MenuCheckboxItemForwardRef = forwardRef(MenuCheckboxItem);

export { MenuCheckboxItemForwardRef as MenuCheckboxItem };
