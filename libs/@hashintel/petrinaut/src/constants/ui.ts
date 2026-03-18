/**
 * UI-related constants for the Petrinaut editor.
 *
 * NOTE: This file is imported by panda.config.ts (build-time, Node context).
 * Do not add browser-only or React imports here.
 *
 * NOTE: SubView registries live in ./ui-subviews.ts to avoid import cycles.
 */

// Code font — used by panda.config.ts (fonts.mono token) and by Monaco editor
// which needs the actual font name (can't resolve CSS variables).
export const CODE_FONT_FAMILY = "'JetBrains Mono Variable', monospace";

// Canvas grid
export const SNAP_GRID_SIZE = 15;

// Panel margin (spacing around panels)
export const PANEL_MARGIN = 0;

// Resize handle
export const RESIZE_HANDLE_SIZE = 5;
export const RESIZE_HANDLE_OFFSET = -Math.floor(RESIZE_HANDLE_SIZE / 2) - 1;

// Left Sidebar
export const DEFAULT_LEFT_SIDEBAR_WIDTH = 320;
export const MIN_LEFT_SIDEBAR_WIDTH = 220;
export const MAX_LEFT_SIDEBAR_WIDTH = 500;

// Properties Panel (right side)
export const DEFAULT_PROPERTIES_PANEL_WIDTH = 450;
export const MIN_PROPERTIES_PANEL_WIDTH = 250;
export const MAX_PROPERTIES_PANEL_WIDTH = 800;

// Bottom Panel
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 180;
export const MIN_BOTTOM_PANEL_HEIGHT = 100;
export const MAX_BOTTOM_PANEL_HEIGHT = 600;
