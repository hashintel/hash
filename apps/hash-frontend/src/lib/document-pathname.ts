/**
 * The pathname this document was itself loaded at, which decides its
 * Content Security Policy. Unlike `location`, client-side navigation doesn't
 * change it. `null` when the browser doesn't report the document's
 * navigation.
 */
export const readDocumentPathname = (): string | null => {
  const [entry] = performance.getEntriesByType("navigation");
  return entry ? new URL(entry.name).pathname : null;
};
