import { UrlObject } from "node:url";

import {
  // eslint-disable-next-line no-restricted-imports
  Button as BaseButton,
  ButtonProps as BaseButtonProps,
} from "@hashintel/design-system";
// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import { forwardRef, FunctionComponent, ReactNode, useMemo } from "react";

import { isHrefExternal } from "../is-href-external";

export type ButtonProps = {
  children: ReactNode;
  openInNewTab?: boolean;
  href?: UrlObject | string;
} & Omit<BaseButtonProps, "href">; // MUI button renders <a /> when href is provided, but typings miss rel and target

export const Button: FunctionComponent<ButtonProps> = forwardRef(
  ({ children, href, openInNewTab, ...props }, ref) => {
    const linkProps = useMemo(() => {
      if (
        href &&
        typeof href === "string" &&
        (openInNewTab || (openInNewTab !== false && isHrefExternal(href)))
      ) {
        return {
          rel: "noopener",
          target: "_blank",
          href,
        };
      }

      return {};
    }, [openInNewTab, href]);

    const Component = (
      <BaseButton {...props} {...linkProps} ref={ref}>
        {children}
      </BaseButton>
    );

    if (
      href &&
      !(
        typeof href === "string" &&
        (openInNewTab || (openInNewTab !== false && isHrefExternal(href)))
      )
    ) {
      return (
        <Link href={href} passHref legacyBehavior>
          {Component}
        </Link>
      );
    }

    return Component;
  },
);
