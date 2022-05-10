import {
  listItemIconClasses,
  listItemTextClasses,
  MenuItem as MuiMenuItem,
  MenuItemProps as MuiMenuItemProps,
  typographyClasses,
} from "@mui/material";
import { FC, forwardRef, ReactNode } from "react";
import { Link } from "./link";

export type MenuItemProps = {
  children?: ReactNode;
  href?: string;
  faded?: boolean;
  noSelectBackground?: boolean;
} & MuiMenuItemProps;

// todo: override dense prop styling
export const MenuItem: FC<MenuItemProps> = forwardRef(
  (
    { children, href, sx = [], faded, selected, noSelectBackground, ...props },
    ref,
  ) => {
    // @todo see if it's possible to check react children to see if Checkbox is present
    // that way we don't have to explicitly pass in noSelectBackground

    const Component = (
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

    if (href) {
      return (
        <Link noLinkStyle href={href}>
          {Component}
        </Link>
      );
    }

    return Component;
  },
);

MenuItem.displayName = "MenuItem";
