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
