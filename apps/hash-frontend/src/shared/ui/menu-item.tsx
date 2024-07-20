import type { forwardRef, ReactNode } from "react";
import type {
  // eslint-disable-next-line no-restricted-imports
  MenuItem as BaseMenuItem,
  MenuItemProps as BaseMenuItemProps,
} from "@hashintel/design-system";

import { Link } from "./link";

export type MenuItemProps = {
  children?: ReactNode;
  href?: string;
} & BaseMenuItemProps;

export const MenuItem = forwardRef<HTMLLIElement, MenuItemProps>(
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
