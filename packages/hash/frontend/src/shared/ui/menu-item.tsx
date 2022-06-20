import { VFC, forwardRef, ReactNode } from "react";
import {
  MenuItem as BaseMenuItem,
  MenuItemProps as BaseMenuItemProps,
} from "@hashintel/hash-design-system";
import { Link } from "./link";

export type MenuItemProps = {
  children?: ReactNode;
  href?: string;
} & BaseMenuItemProps;

export const MenuItem: VFC<MenuItemProps> = forwardRef(
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
