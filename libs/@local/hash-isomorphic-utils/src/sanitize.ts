import { frontendUrl } from "./environment.js";

export const sanitizeHref = (url?: string) => {
  if (!url) {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Could not construct URL from ${url}`);
    return "";
  }
};
