// @todo: update the regex to check against the domain of the hosted version of HASH
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";

export const isHrefExternal = (href: string) => {
  if (!href) {
    return false;
  }

  if (/^(mailto:|#|\/)/.test(href)) {
    return false;
  }

  if (href.startsWith(frontendUrl)) {
    return false;
  }

  if (href.startsWith("#")) {
    return false;
  }

  if (href.startsWith("/")) {
    return false;
  }

  if (
    new URL(href).hostname === "hash.ai" &&
    !isSelfHostedInstance &&
    /(.*\/@.+\/types\/(entity-type|data-type|property-type)\/[^/]+\/)(?:v\/(\d+))?$/.test(
      href,
    )
  ) {
    /**
     * This is a type URL with a hash.ai origin, on a non-self-hosted instance, so either:
     * 1. We are on the main production deployment, where all types have a hash.ai origin
     * 2. We are on a development or staging instance which is being treated as the main deployment,
     *    and which has system types which have a hash.ai origin
     *
     * In either case, we should serve the type as internal.
     */
    return false;
  }

  return true;
};
