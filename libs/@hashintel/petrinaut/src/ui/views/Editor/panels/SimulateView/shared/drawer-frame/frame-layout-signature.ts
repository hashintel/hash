/**
 * The boxes the frame promises to hold still, read from the DOM: the header
 * and note row heights, every card's title and body height, every grid's row
 * height and the steps table's height. Two renders of one drawer in two
 * states must give the same signature; tests and probes compare them.
 */
export type FrameLayoutSignature = {
  header: string;
  note: string;
  cards: [title: string, bodyHeight: string][];
  gridRows: string[];
  steps: string | null;
};

const styleHeight = (element: Element | null): string =>
  element instanceof HTMLElement ? element.style.height : "";

export const frameLayoutSignature = (
  root: ParentNode,
): FrameLayoutSignature => ({
  header: styleHeight(root.querySelector("[data-frame-header]")),
  note: styleHeight(root.querySelector("[data-frame-note]")),
  cards: [...root.querySelectorAll("[data-chart-card]")].map((card) => [
    card.querySelector("span")?.textContent ?? "",
    styleHeight(card.querySelector("[data-chart-card-body]")),
  ]),
  gridRows: [...root.querySelectorAll("[data-chart-card-grid]")].map((grid) =>
    grid instanceof HTMLElement ? grid.style.gridAutoRows : "",
  ),
  steps: root.querySelector("[data-steps-table]")
    ? styleHeight(root.querySelector("[data-steps-table]"))
    : null,
});
