// eslint-disable-next-line no-restricted-imports
import Link from "next/link";
import { VFC, forwardRef, useMemo, ReactNode } from "react";
import {
  /* eslint-disable-next-line -- allow import of original button to extend it */
  Button as BaseButton,
  ButtonProps as BaseButtonProps,
} from "@hashintel/hash-design-system";
import { isHrefExternal } from "./link-";

export type ButtonProps = {
  children: ReactNode;
} & BaseButtonProps; // MUI button renders <a /> when href is provided, but typings miss rel and target

export const Button: VFC<ButtonProps> = forwardRef(
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
        <Link href={href} passHref>
          {Component}
        </Link>
      );
    }

    return Component;
  },
);
