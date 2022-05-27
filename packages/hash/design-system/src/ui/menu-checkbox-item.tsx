import { Checkbox, ListItemIcon } from "@mui/material";
import { ReactNode, forwardRef, ForwardRefRenderFunction } from "react";
import { MenuItem, MenuItemProps } from "./menu-item";

export type MenuCheckboxItemProps = {
  children?: ReactNode;
} & Omit<MenuItemProps, "noSelectBackground">;

const MenuCheckboxItem: ForwardRefRenderFunction<
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

const MenuCheckboxItemForwardRef = forwardRef(MenuCheckboxItem);

export { MenuCheckboxItemForwardRef as MenuCheckboxItem };
