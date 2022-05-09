// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import {
  listItemIconClasses,
  listItemTextClasses,
  MenuItem as MuiMenuItem,
  MenuItemProps as MuiMenuItemProps,
  typographyClasses,
} from "@mui/material";
import { FC, forwardRef, ReactNode, useMemo } from "react";
import { isHrefExternal } from "./link";

export type MenuItemProps = {
  children: ReactNode;
  href?: string;
  faded?: boolean;
} & MuiMenuItemProps;

// todo: override dense prop styling
export const MenuItem: FC<MenuItemProps> = forwardRef(
  ({ children, href, sx = [], faded, ...props }, ref) => {
    const linkProps = useMemo(() => {
      if (href && isHrefExternal(href)) {
        return {
          rel: "noopener",
          target: "_blank",
          href,
        };
      }

      return {};
    }, [href]);

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
        {...linkProps}
        ref={ref}
      >
        {children}
      </MuiMenuItem>
    );

    if (href && !isHrefExternal(href)) {
      return <Link href={href}>{Component}</Link>;
    }

    return Component;
  },
);
