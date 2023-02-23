// @todo: update the regex to check against the domain of the hosted version of HASH
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";

export const isHrefExternal = (href: string) =>
  (href === "/discord" || !/^(mailto:|#|\/)/.test(href)) &&
  !href.startsWith(frontendUrl);
