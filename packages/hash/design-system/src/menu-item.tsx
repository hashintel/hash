import {
  listItemIconClasses,
  listItemTextClasses,
  MenuItem as MuiMenuItem,
  MenuItemProps as MuiMenuItemProps,
  typographyClasses,
} from "@mui/material";
import { forwardRef, FunctionComponent, ReactNode } from "react";

export type MenuItemProps = {
  children?: ReactNode;
  faded?: boolean;
  noSelectBackground?: boolean;
} & MuiMenuItemProps;

export const MenuItem: FunctionComponent<MenuItemProps> = forwardRef(
  (
    { children, sx = [], faded, selected, noSelectBackground, ...props },
    ref,
  ) => {
    return (
      <MuiMenuItem
        sx={[
          ({ palette }) => ({
            ...(faded && {
              [`& .${listItemTextClasses.primary}, .${typographyClasses.root}`]:
                {
                  color: palette.gray[60],
                },
              [`& .${listItemIconClasses.root}, & svg`]: {
                color: palette.gray[40],
              },
            }),
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        {...props}
        ref={ref}
        // noSelectBackground is needed for scenarios where we don't need
        // selected styles to be applied once the menu item is selected
        // A typical example is when we have a checkbox present in the menuItem,
        // we wouldn't need the select styles in that case, since the checkbox can be
        // used to determine if the menuItem was selected or not
        selected={!noSelectBackground && selected}
      >
        {children}
      </MuiMenuItem>
    );
  },
);

MenuItem.displayName = "MenuItem";
