// @todo: update the regex to check against the domain of the hosted version of HASH
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";

export const isHrefExternal = (href: string) =>
  !!href &&
  (href === "/cases" ||
    href === "/contact" ||
    href === "/guide" ||
    !/^(mailto:|#|\/)/.test(href)) &&
  !href.startsWith(frontendUrl) &&
  // To be removed in H-1172: Temporary provision to serve types with a https://hash.ai URL from https://app.hash.ai
  !(
    process.env.NEXT_PUBLIC_SELF_HOSTED_HASH !== "true" &&
    ["https://app.hash.ai", "http://localhost:3000"].includes(frontendUrl) &&
    (href.startsWith("#") ||
      href.startsWith("/") ||
      new URL(href).hostname === "hash.ai")
  );
