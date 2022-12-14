// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import { UrlObject } from "url";
import { FunctionComponent, forwardRef, useMemo, ReactNode } from "react";
import {
  Button as BaseButton,
  ButtonProps as BaseButtonProps,
} from "@hashintel/hash-design-system";
import { frontendUrl } from "@hashintel/hash-shared/environment";

// @todo: update the regex to check against the domain of the hosted version of HASH
export const isHrefExternal = (href: string | UrlObject) =>
  typeof href === "string" &&
  (href === "/discord" || !/^(mailto:|#|\/)/.test(href)) &&
  !href.startsWith(frontendUrl);

export type ButtonProps = {
  children: ReactNode;
} & BaseButtonProps; // MUI button renders <a /> when href is provided, but typings miss rel and target

export const Button: FunctionComponent<ButtonProps> = forwardRef(
  ({ children, href, ...props }, ref) => {
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
      <BaseButton {...props} {...linkProps} ref={ref}>
        {children}
      </BaseButton>
    );

    if (href && !isHrefExternal(href)) {
      return (
        <Link href={href} passHref legacyBehavior>
          {Component}
        </Link>
      );
    }

    return Component;
  },
);
