import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { sanitizeHref } from "@local/hash-isomorphic-utils/sanitize";
import type { Url } from "next/dist/shared/lib/router/router";

import { isHrefExternal } from "./is-href-external";

/**
 * A RegExp to match the path of HASH or Block Protocol-formatted type URLs.
 * Captures:
 * 1. The base URL
 * 2. The kind (e.g. entity-type, data-type, property-type)
 * 3. The version (if present)
 */
const typeUrlRegExp =
  /(.*\/@.+\/types\/(entity-type|data-type|property-type)\/[^/]+\/)(?:v\/(\d+))?$/;

/**
 * For a given href to be used in a link:
 * 1. Ensures that the href is a valid http or https URL
 * 2. Rewrites external type URLs to use the internal type route
 * 3. Specifies whether the returned href points to a different site or not
 */
export const generateLinkParameters = (
  hrefToCheck?: string | Url,
): {
  isExternal: boolean;
  href: string;
} => {
  const href =
    typeof hrefToCheck === "string" ? hrefToCheck : hrefToCheck?.href;

  if (href === null || href === undefined) {
    return {
      isExternal: false,
      href: "",
    };
  }

  const sanitizedHref = sanitizeHref(href);
  if (!sanitizedHref) {
    return {
      isExternal: false,
      href: "",
    };
  }

  const isExternal = isHrefExternal(sanitizedHref);

  const paramsString = sanitizedHref.split("?")[1];

  // Check whether this matches a HASH-formatted type URL (BaseUrl or VersionedURL)
  const [, typeBaseUrl, typeKind, typeVersion] =
    sanitizedHref.split("?")[0]!.match(typeUrlRegExp) ?? [];

  if (typeBaseUrl) {
    if (
      (isExternal && typeKind === "entity-type") ||
      (isExternal && typeKind === "data-type")
    ) {
      // If it's an external entity type, use the type route for loading external types
      const base64EncodedBaseUrl = btoa(typeBaseUrl);
      return {
        isExternal: false, // it's an external type but we're using an internal route
        href: `/types/external/${typeKind}/${base64EncodedBaseUrl}${
          typeVersion ? `/v/${typeVersion}` : ""
        }${paramsString ? `?${paramsString}` : ""}`,
      };
    }

    const pathname = new URL(href, frontendUrl).pathname;

    return {
      isExternal,
      href: isExternal
        ? href
        : `${pathname}${paramsString ? `?${paramsString}` : ""}`,
    };
  }

  return {
    isExternal,
    href: sanitizedHref,
  };
};
