// eslint-disable-next-line no-restricted-imports
import MuiLink, { LinkProps as MuiLinkProps } from "@mui/material/Link";
import { styled } from "@mui/material/styles";
import clsx from "clsx";
// eslint-disable-next-line no-restricted-imports
import NextLink, { LinkProps as NextLinkProps } from "next/link";
import { useRouter } from "next/router";
import * as React from "react";
import { UrlObject } from "url";
import { FRONTEND_URL } from "../config";
import { Button } from "./Button";

// List of domains that are considered internal (i.e. should not be opened in a new tab)
const internalDomains = ["hash.dev", "hash.ai", "blockprotocol.org"];

/**
 * @param {string | UrlObject} href
 * @returns {boolean} whether or not the provided href URL is external
 */
export const isHrefExternal = (href: string | UrlObject) => {
  if (typeof href !== "string") {
    /** @todo: handle NextJs UrlObjects, currently they're always considered external */
    return false;
  }

  const isRelativeUrl = href.startsWith("/");

  if (isRelativeUrl) {
    return href === "/discord";
  }

  const isAnchorFragment = href.startsWith("#");

  if (isAnchorFragment) {
    return false;
  }

  const isMailtoLink = /^(mailto:|#|\/|https:\/\/hash\.dev)/.test(href);
  const isFrontendUrl = href.startsWith(FRONTEND_URL);

  const { hostname } = new URL(href);

  const isInternalDomain = !!internalDomains.find((internalDomain) =>
    hostname.endsWith(internalDomain),
  );

  return !isMailtoLink && !isFrontendUrl && !isInternalDomain;
};

/**
 * This component is based on
 * https://github.com/mui-org/material-ui/blob/a5c92dfd84dfe5888a8b383a9b5fe5701a934564/examples/nextjs/src/Link.js
 */

// Add support for the sx prop for consistency with the other branches.
const Anchor = styled("a")({});

type NextLinkComposedProps = {
  to: NextLinkProps["href"];
} & Omit<NextLinkProps, "href" | "passHref"> &
  Omit<MuiLinkProps, "href" | "color">;

export const NextLinkComposed = React.forwardRef<
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
    >
      <Anchor ref={ref} {...other} />
    </NextLink>
  );
});

export type LinkProps = Omit<NextLinkProps, "passHref"> &
  Omit<MuiLinkProps, "href" | "color">;

// A styled version of the Next.js Link component:
// https://nextjs.org/docs/api-reference/next/link
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  (props, ref) => {
    const { as: linkAs, className: classNameProps, href, ...other } = props;

    const router = useRouter();
    const pathname = typeof href === "string" ? href : href.pathname;
    const className = clsx(classNameProps, {
      active: router.pathname === pathname,
    });

    if (process.env.NODE_ENV !== "production") {
      const children = other.children;
      if (React.isValidElement(children) && children.type === Button) {
        throw new Error(
          "Please use <Button href='' /> instead of <Link><Button /></Link>",
        );
      }
    }

    if (isHrefExternal(href)) {
      other.rel = "noopener";
      other.target = "_blank";

      return (
        <MuiLink
          className={className}
          href={href as string}
          ref={ref}
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
