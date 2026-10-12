export const testDocumentSearchWord = "quokka";

/**
 * The text of the generated test documents, one entry per page.
 * `testDocumentSearchWord` appears on the first and third pages only.
 * The generators write this text without escaping it, so it holds only
 * letters, digits, spaces and full stops.
 */
export const testDocumentPages = [
  {
    heading: "Page 1",
    body: `A ${testDocumentSearchWord} lives on this page.`,
  },
  { heading: "Page 2", body: "Nothing to find here." },
  {
    heading: "Page 3",
    body: `Another ${testDocumentSearchWord} lives on this page.`,
  },
] as const;
