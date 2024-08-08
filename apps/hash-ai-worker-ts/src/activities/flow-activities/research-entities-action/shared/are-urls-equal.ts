const stripHashFromUrl = (url: string) => {
  try {
    const urlObject = new URL(url);

    urlObject.hash = "";

    return urlObject.toString();
  } catch {
    return url;
  }
};

/**
 * Compare two URLs, ignoring any anchor fragment (e.g. https://example.com/info#legal === https://example.com/legal)
 */
export const areUrlsEqual = (urlA: string, urlB: string) =>
  stripHashFromUrl(urlA) === stripHashFromUrl(urlB);
