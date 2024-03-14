import type { MenuItemProps as BaseMenuItemProps } from "@hashintel/design-system";
import {
  // eslint-disable-next-line no-restricted-imports
  MenuItem as BaseMenuItem,
} from "@hashintel/design-system";
import type { FunctionComponent, ReactNode } from "react";
import { forwardRef } from "react";

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
