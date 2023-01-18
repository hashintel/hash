import {
  MenuItem as BaseMenuItem,
  MenuItemProps as BaseMenuItemProps,
} from "@local/design-system";
import { forwardRef, FunctionComponent, ReactNode } from "react";

import { Link } from "./link";

export type MenuItemProps = {
  children?: ReactNode;
  href?: string;
} & BaseMenuItemProps;

export const MenuItem: FunctionComponent<MenuItemProps> = forwardRef(
  ({ children, href, ...props }, ref) => {
    const Component = (
      <BaseMenuItem ref={ref} {...props}>
        {children}
      </BaseMenuItem>
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
