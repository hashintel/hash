import { expect } from "./runtime";

import type { Locator } from "./runtime";

/**
 * Wait until no ancestor clips any part of the element, such as a `Collapse`
 * that is still opening. Playwright clicks a clipped element by scrolling its
 * clipping ancestor, which scrolls back as the ancestor grows and moves the
 * element out from under the pointer before the click lands.
 */
export const expectFullyShown = (locator: Locator) =>
  expect(locator).toBeInViewport({ ratio: 1 });
