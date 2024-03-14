import type { UrlObject } from "node:url";

import type { ButtonProps as BaseButtonProps } from "@hashintel/design-system";
import {
  // eslint-disable-next-line no-restricted-imports
  Button as BaseButton,
} from "@hashintel/design-system";
// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import type { FunctionComponent, ReactNode } from "react";
import { forwardRef, useMemo } from "react";

import { generateLinkParameters } from "../generate-link-parameters";

export type ButtonProps = {
  children: ReactNode;
  openInNewTab?: boolean;
  href?: UrlObject | string;
} & Omit<BaseButtonProps, "href">; // MUI button renders <a /> when href is provided, but typings miss rel and target

export const Button: FunctionComponent<ButtonProps> = forwardRef(
  ({ children, href: unvalidatedHref, openInNewTab, ...props }, ref) => {
    const { href, isExternal } = generateLinkParameters(unvalidatedHref);

    const linkProps = useMemo(() => {
      if (href && (openInNewTab || (openInNewTab !== false && isExternal))) {
        return {
          rel: "noopener",
          target: "_blank",
          href,
        };
      }

      return {};
    }, [isExternal, openInNewTab, href]);

    const Component = (
      <BaseButton {...props} {...linkProps} ref={ref}>
        {children}
      </BaseButton>
    );

    if (href && !(openInNewTab || (openInNewTab !== false && isExternal))) {
      return (
        <Link href={href} passHref legacyBehavior>
          {Component}
        </Link>
      );
    }

    return Component;
  },
);
