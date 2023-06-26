import { UrlObject } from "node:url";

import {
  Button as BaseButton,
  ButtonProps as BaseButtonProps,
} from "@hashintel/design-system";
// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import { forwardRef, FunctionComponent, ReactNode, useMemo } from "react";

import { isHrefExternal } from "../is-href-external";

export type ButtonProps = {
  children: ReactNode;
  href?: UrlObject | string;
} & Omit<BaseButtonProps, "href">; // MUI button renders <a /> when href is provided, but typings miss rel and target

export const Button: FunctionComponent<ButtonProps> = forwardRef(
  ({ children, href, ...props }, ref) => {
    const linkProps = useMemo(() => {
      if (href && typeof href === "string" && isHrefExternal(href)) {
        return {
          rel: "noopener",
          target: "_blank",
          href,
        };
      }

      return {};
    }, [href]);

    const Component = (
      <BaseButton {...props} {...linkProps} ref={ref}>
        {children}
      </BaseButton>
    );

    if (href && !(typeof href === "string" && isHrefExternal(href))) {
      return (
        <Link href={href} passHref legacyBehavior>
          {Component}
        </Link>
      );
    }

    return Component;
  },
);
