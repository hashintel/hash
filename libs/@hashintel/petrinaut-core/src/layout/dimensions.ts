import type { LayoutDimensions } from "./calculate-graph-layout";

/**
 * Layout-stable node dimensions used by {@link calculateGraphLayout}.
 *
 * Per-axis maximum of the compact and classic rendering dimensions (see
 * `ui/views/SDCPN/node-dimensions.ts`) so auto-layout output is invariant to
 * the user's compact/classic visualization choice. Without this, toggling
 * `userSettings.compactNodes` after running layout would visually shift every
 * node.
 */
export const layoutNodeDimensions: LayoutDimensions = {
  place: { width: 180, height: 130 },
  transition: { width: 180, height: 80 },
};
