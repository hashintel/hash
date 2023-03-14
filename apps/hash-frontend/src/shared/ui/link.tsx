import {
  // eslint-disable-next-line no-restricted-imports
  Link as MuiLink,
  LinkProps as MuiLinkProps,
  styled,
} from "@mui/material";
import clsx from "clsx";
// eslint-disable-next-line no-restricted-imports
import NextLink, { LinkProps as NextLinkProps } from "next/link";
import { useRouter } from "next/router";
import { forwardRef, isValidElement } from "react";

import { isHrefExternal } from "../is-href-external";
import { Button } from "./button";

/**
 * This component is based on https://github.com/mui-org/material-ui/blob/a5c92dfd84dfe5888a8b383a9b5fe5701a934564/examples/nextjs/src/Link.js
 */

// Add support for the sx prop for consistency with the other branches.
const Anchor = styled("a")({
  color: "inherit",
});

type NextLinkComposedProps = {
  to: NextLinkProps["href"];
} & Omit<NextLinkProps, "href" | "passHref"> &
  Omit<MuiLinkProps, "href" | "color">;

export const NextLinkComposed = forwardRef<
  HTMLAnchorElement,
  NextLinkComposedProps
>((props, ref) => {
  const { as, to, replace, scroll, shallow, prefetch, locale, ...other } =
    props;

  return (
    <NextLink
      href={to}
      prefetch={prefetch}
      as={as}
      replace={replace}
      scroll={scroll}
      shallow={shallow}
      passHref
      locale={locale}
      legacyBehavior
    >
      <Anchor ref={ref} {...other} />
    </NextLink>
  );
});

export type LinkProps = {
  activeClassName?: string;
  noLinkStyle?: boolean;
} & Omit<NextLinkProps, "passHref"> &
  Omit<MuiLinkProps, "href" | "color">;

// A styled version of the Next.js Link component:
// https://nextjs.org/docs/api-reference/next/link
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  (
    props,
    ref, // https://github.com/prettier/prettier/issues/11923
  ) => {
    const {
      activeClassName = "active",
      as: linkAs,
      className: classNameProps,
      href,
      noLinkStyle,
      ...other
    } = props;

    const router = useRouter();
    const pathname = typeof href === "string" ? href : href.pathname;
    const className = clsx(classNameProps, {
      [activeClassName]: router.pathname === pathname && activeClassName,
    });

    if (process.env.NODE_ENV !== "production") {
      const children = other.children;
      if (isValidElement(children) && children.type === Button) {
        throw new Error(
          "Please use <Button href='' /> instead of <Link><Button /></Link>",
        );
      }
    }

    if (typeof href === "string" && isHrefExternal(href)) {
      other.rel = "noopener";
      other.target = "_blank";

      if (noLinkStyle) {
        return (
          <Anchor className={className} href={href} ref={ref} {...other} />
        );
      }

      return <MuiLink className={className} href={href} ref={ref} {...other} />;
    }

    if (noLinkStyle) {
      return (
        <NextLinkComposed
          sx={{
            ":focus-visible": {
              outlineColor: ({ palette }) => palette.blue["70"],
            },
          }}
          className={className}
          ref={ref}
          to={href}
          {...other}
        />
      );
    }

    return (
      <MuiLink
        component={NextLinkComposed}
        as={linkAs}
        className={className}
        ref={ref}
        to={href}
        {...other}
      />
    );
  },
);
