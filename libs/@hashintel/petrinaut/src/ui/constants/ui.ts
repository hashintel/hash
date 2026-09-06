import { GRID_SIZE } from "@hashintel/petrinaut-core";

export { CODE_FONT_FAMILY } from "./fonts";

/**
 * UI-related constants for the Petrinaut editor.
 *
 * NOTE: This file is imported by panda.config.ts (build-time, Node context).
 * Do not add browser-only or React imports here.
 *
 * NOTE: SubView registries live in ./ui-subviews.ts to avoid import cycles.
 */

// Canvas grid
export const SNAP_GRID_SIZE = GRID_SIZE;

// Panel margin (spacing around panels)
export const PANEL_MARGIN = 0;

// Resize handle
export const RESIZE_HANDLE_SIZE = 5;
export const RESIZE_HANDLE_OFFSET = -Math.floor(RESIZE_HANDLE_SIZE / 2) - 1;

// Left Sidebar (DEFAULT_LEFT_SIDEBAR_WIDTH lives in react/state/panel-defaults)
export const MIN_LEFT_SIDEBAR_WIDTH = 220;
export const MAX_LEFT_SIDEBAR_WIDTH = 500;

// Properties Panel — right side (DEFAULT_PROPERTIES_PANEL_WIDTH in react/state/panel-defaults)
export const MIN_PROPERTIES_PANEL_WIDTH = 250;
export const MAX_PROPERTIES_PANEL_WIDTH = 800;

// Viewport controls — the button column at the bottom right of the canvas.
// The width is one `xs` icon button, rounded up from its rendered 21px.
export const VIEWPORT_CONTROLS_OFFSET = 12;
export const VIEWPORT_CONTROLS_WIDTH = 24;

/** What a control sharing the column's row has to leave free of it. */
export const VIEWPORT_CONTROLS_CLEARANCE =
  VIEWPORT_CONTROLS_OFFSET + VIEWPORT_CONTROLS_WIDTH;

// Bottom Panel (DEFAULT_BOTTOM_PANEL_HEIGHT in react/state/panel-defaults)
export const MIN_BOTTOM_PANEL_HEIGHT = 100;
export const MAX_BOTTOM_PANEL_HEIGHT = 600;
