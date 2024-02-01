import { frontendUrl } from "@local/hash-isomorphic-utils/environment";

export const sanitizeHref = (url?: string) => {
  if (!url) {
    return "";
  } else if (url.startsWith("#")) {
    return url;
  }

  const { href, protocol } = new URL(
    url,
    url.startsWith("/") ? frontendUrl : undefined,
  );

  if (protocol !== "https:" && protocol !== "http:") {
    return "";
  }

  return href;
};
