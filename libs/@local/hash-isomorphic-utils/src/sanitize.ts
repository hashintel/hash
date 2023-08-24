export const sanitizeHref = (url?: string) => {
  if (!url) {
    return "";
  }

  const { href, protocol } = new URL(url);

  if (protocol !== "https:" && protocol !== "http:") {
    return "";
  }

  return href;
};
