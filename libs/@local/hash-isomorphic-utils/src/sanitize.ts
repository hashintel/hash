import { frontendUrl } from "./environment.js";

// oxlint-disable-next-line hash/prefer-options-object -- single optional argument of a public helper called positionally across packages
export const sanitizeHref = (url?: string): string => {
  if (url === undefined || url === "") {
    return "";
  } else if (url.startsWith("#")) {
    return url;
  }

  try {
    const { href, protocol } = new URL(
      url,
      url.startsWith("/") ? frontendUrl : undefined,
    );
    if (protocol !== "https:" && protocol !== "http:") {
      return "";
    }

    return href;
  } catch {
    // eslint-disable-next-line no-console -- report the unparseable URL; there is no logger in this isomorphic util
    console.error(`Could not construct URL from ${url}`);
    return "";
  }
};
