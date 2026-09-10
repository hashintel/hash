import { configure, fireEvent } from "@testing-library/react";

// The compact chips on the title line echo the strip's text, always mounted
// and inert; text queries in a test that renders a frame read the strip, as
// a reader does.
configure({ defaultIgnore: "script, style, [data-frame-compact-stats] *" });

/** The frame header's element, for tests that read its height and state. */
export const frameHeader = (): HTMLElement =>
  document.querySelector<HTMLElement>("[data-frame-header]")!;

/** The frame body's scroll container. */
export const frameBody = (): HTMLElement =>
  document.querySelector<HTMLElement>("[data-frame-body]")!;

/** The frame body's viewport height in the tests, in pixels. */
const BODY_CLIENT_HEIGHT = 600;

/**
 * Scrolls the frame body to `top` the way a wheel would: jsdom lays nothing
 * out, so the offset and the geometry are set on the element and its scroll
 * event fired. The body overflows its viewport by `overflow` pixels, far
 * more than the header gives back unless a test says otherwise.
 */
export const scrollFrameBody = (
  top: number,
  { overflow = 2000 }: { overflow?: number } = {},
): void => {
  const body = frameBody();
  for (const [property, value] of Object.entries({
    scrollTop: top,
    clientHeight: BODY_CLIENT_HEIGHT,
    scrollHeight: BODY_CLIENT_HEIGHT + overflow,
  })) {
    Object.defineProperty(body, property, { configurable: true, value });
  }
  fireEvent.scroll(body);
};

/**
 * The boxes the frame promises to hold still, read from the DOM: the header's
 * condensed state (its height follows the strip's rows, so the state is what
 * the DOM pins), the note row's height, every card's title and body height,
 * every grid's row height and the steps table's height. Two renders of one
 * drawer in two states must give the same signature; tests compare them.
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
  header:
    root.querySelector("[data-frame-header]")?.getAttribute("data-condensed") ??
    "",
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
