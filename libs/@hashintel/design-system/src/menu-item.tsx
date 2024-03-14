import type { MenuItemProps as MuiMenuItemProps } from "@mui/material";
import {
  listItemIconClasses,
  listItemTextClasses,
  MenuItem as MuiMenuItem,
  typographyClasses,
} from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { forwardRef } from "react";

export type MenuItemProps = {
  children?: ReactNode;
  faded?: boolean;
  dangerous?: boolean;
  noSelectBackground?: boolean;
} & MuiMenuItemProps;

export const MenuItem: FunctionComponent<MenuItemProps> = forwardRef(
  (
    {
      children,
      sx = [],
      faded,
      dangerous,
      selected,
      noSelectBackground,
      ...props
    },
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
            ...(dangerous && {
              [`& .${listItemTextClasses.primary}, .${typographyClasses.root}`]:
                {
                  color: palette.red[70],
                },
              "&:hover": {
                [`& .${listItemTextClasses.primary}, .${typographyClasses.root}`]:
                  {
                    color: palette.red[90],
                  },
              },
              [`& .${listItemIconClasses.root}, & svg`]: {
                color: palette.red[50],
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
