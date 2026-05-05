/**
 * Default panel sizes shared between user-settings state (in `/react/state`)
 * and the rendering layer (in `/ui`).
 *
 * Lives in `/lib` (neutral, no layer assignment) so `/react/state` does not
 * have to reach into `/ui` to read its own initial state.
 */

export const DEFAULT_LEFT_SIDEBAR_WIDTH = 320;

export const DEFAULT_PROPERTIES_PANEL_WIDTH = 450;

export const DEFAULT_BOTTOM_PANEL_HEIGHT = 180;
