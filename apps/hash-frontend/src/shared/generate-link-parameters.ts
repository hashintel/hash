import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { sanitizeHref } from "@local/hash-isomorphic-utils/sanitize";
import { Url } from "next/dist/shared/lib/router/router";

import { isHrefExternal } from "./is-href-external";

/**
 * A RegExp to match the path of HASH or Block Protocol-formatted type URLs,
 * First capture will be the base URL, and the second (if present) the version number.
 */
const typeUrlRegExp =
  /(.*\/@.+\/types\/(?:entity-type|data-type|property-type)\/[^/]+\/)(?:v\/(\d+))?$/;

/**
 * For a given href to be used in a link:
 * 1. Ensures that the href is a valid http or https URL
 * 2. Rewrites external type URLs to use the internal type route
 * 3. Specifies whether the returned href points to a different site or not
 */
export const generateLinkParameters = (
  hrefToCheck?: string | Url | undefined,
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
  const [, typeBaseUrl, typeVersion] =
    sanitizedHref.split("?")[0]!.match(typeUrlRegExp) ?? [];

  if (typeBaseUrl) {
    if (isExternal && typeBaseUrl.includes("/entity-type/")) {
      // If it's an external entity type, use the type route for loading external types
      const base64EncodedBaseUrl = btoa(typeBaseUrl);
      return {
        isExternal: false, // it's an external type but we're using an internal route
        href: `/types/external/entity-type/${base64EncodedBaseUrl}${
          typeVersion ? `/v/${typeVersion}` : ""
        }${paramsString ? `?${paramsString}` : ""}`,
      };
    }

    const pathname = new URL(href, frontendUrl).pathname;

    return {
      isExternal,
      href:
        /**
         * Until H-1172 is implemented, we need to just take the pathname of the href, because we might
         * have links with a https://hash.ai origin that need to be served from a https://app.hash.ai frontend
         * The exceptions are the /contact and /discord routes which actually reside at https://hash.ai
         * @todo when implementing H-1172, just use the href here
         */
        isExternal ||
        pathname.startsWith("/discord") ||
        pathname.startsWith("/contact")
          ? href
          : `${pathname}${paramsString ? `?${paramsString}` : ""}`,
    };
  }

  return {
    isExternal,
    href: sanitizedHref,
  };
};
