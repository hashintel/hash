import type { UrlObject } from "node:url";

import type { LinkProps as MuiLinkProps } from "@mui/material";
import { Link as MuiLink, styled } from "@mui/material";
import clsx from "clsx";
// eslint-disable-next-line no-restricted-imports
import type { LinkProps as NextLinkProps } from "next/link";
// eslint-disable-next-line no-restricted-imports
import NextLink from "next/link";
import { useRouter } from "next/router";
import { forwardRef, isValidElement } from "react";

import { FRONTEND_URL } from "../config";
import { Button } from "./button";

// List of domains that are considered internal (i.e. should not be opened in a new tab)
const internalDomains = ["hash.dev", "hash.ai", "blockprotocol.org"];

/**
 * @param {string} url - the URL which is parsed
 * @returns {string | null} - the hostname of the URL if it is a valid URL, otherwise null
 */
const parseHostnameFromUrl = (url: string) => {
  try {
    const { hostname } = new URL(url);

    return hostname;
  } catch {
    return null;
  }
};

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

  const isAnchorFragment = href.startsWith("#");

  if (isRelativeUrl || isAnchorFragment) {
    return false;
  }

  const isMailtoLink = /^(mailto:|#|\/|https:\/\/hash\.dev)/.test(href);
  const isFrontendUrl = href.startsWith(FRONTEND_URL);

  const hostname = parseHostnameFromUrl(href);

  const isInternalDomain =
    hostname &&
    !!internalDomains.find((internalDomain) =>
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

export type LinkProps = Omit<NextLinkProps, "passHref"> &
  Omit<MuiLinkProps, "href" | "color">;

// A styled version of the Next.js Link component:
// https://nextjs.org/docs/api-reference/next/link
export const Link = forwardRef<
  HTMLAnchorElement,
  LinkProps & { openInNew?: boolean }
>(
  (
    props,
    ref, // https://github.com/prettier/prettier/issues/11923
  ) => {
    const {
      as: linkAs,
      className: classNameProps,
      href,
      openInNew,
      ...other
    } = props;

    const router = useRouter();
    const pathname = typeof href === "string" ? href : href.pathname;
    const className = clsx(classNameProps, {
      active: router.pathname === pathname,
    });

    if (process.env.NODE_ENV !== "production") {
      const children = other.children;
      if (isValidElement(children) && children.type === Button) {
        throw new Error(
          "Please use <Button href='' /> instead of <Link><Button /></Link>",
        );
      }
    }

    if (openInNew ?? isHrefExternal(href)) {
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
