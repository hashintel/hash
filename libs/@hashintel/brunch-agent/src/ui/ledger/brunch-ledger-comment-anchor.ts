/** The text of `element` that `range` covers. */
const coveredText = (range: Range, element: Element): string => {
  const overlap = document.createRange();
  overlap.selectNodeContents(element);
  if (range.compareBoundaryPoints(Range.START_TO_START, overlap) > 0)
    overlap.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, overlap) < 0)
    overlap.setEnd(range.endContainer, range.endOffset);
  return overlap.toString();
};

/**
 * The addresses of the records whose text a selection in the Ledger document
 * covers, in document order, each once. A selection that only reaches a
 * record's edge, as a triple-click reaches the start of the next block,
 * leaves it out.
 */
export const selectedLedgerAddresses = (
  range: Range,
  root: Element,
): string[] => {
  const addresses = new Set<string>();
  for (const element of root.querySelectorAll<HTMLElement>(
    "[data-ledger-address]",
  )) {
    const address = element.dataset.ledgerAddress;
    if (
      address !== undefined &&
      range.intersectsNode(element) &&
      coveredText(range, element).trim() !== ""
    )
      addresses.add(address);
  }
  return [...addresses];
};
