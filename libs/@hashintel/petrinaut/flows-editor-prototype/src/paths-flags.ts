/**
 * Branching path takes (inbox `branching`, 5 Nov), read from the URL only. With no `?paths=` the panel and the canvas
 * look as they do today.
 *
 * - `b` (default, 30 Oct): Ask a person's paths hang under the Decision output in Outputs, one line per value.
 * - `i2` (Figma I2 `748:30752`, 1 Nov; 3 Nov call): Outputs lists Decision as data, and a separate Paths section
 *   holds one card per path ("When Decision is Approved", where it leads), then Otherwise. Enum values only. The
 *   card carries an Otherwise port too.
 * - `cr` (Ciarán, Slack 5 Nov 11:20): If is binary; a Switch has one condition per path and an optional Default,
 *   with no if-elif-else. Ask a person's panel shows the Decision output alone. Branching lives on the canvas, as
 *   one port per Decision value, so the cases cover every value and need no Default.
 * - `attio` (Attio study, ops `research/attio-paths-2026-11-05`, 5 Nov): as `cr`, with Attio's panel parts. The card
 *   lists its paths as port rows, a hollow ring for an open path and a filled dot for a connected one. Outputs lists
 *   Decision as data; a Next step section has one slot per path, in card order: the path's name, then the step it
 *   leads to (×) or "Select next step". An empty path is where the flow ends, not a problem.
 */
export type PathsTake = "b" | "i2" | "cr" | "attio";

const pathsParam = new URLSearchParams(globalThis.location.search).get("paths");

/**
 * If and Switch paths (inbox `paths-no-rail`, B, picked 12 Nov). With no `?paths=` both panels head the section
 * "Paths" and draw each path as a group: its condition rows, then "Goes to" and the next-step select, a hairline
 * between groups. If is Yes (the condition rows) and No ("When the condition doesn't match"); a Switch's Default is
 * last ("When no case matches"). A path with no next step reads "Ends here" in its select.
 * `?paths=rail` shows the look from before the pick: If's Yes / No with muted true / false under Outputs, the
 * Switch's paths on the rail. The older takes (`i2`, `cr`, `attio`) keep their own If and Switch panels.
 */
export const pathsGroups = pathsParam === null || pathsParam === "b";

export const pathsTake: PathsTake = (() => {
  const value = pathsParam;
  return value === "i2" || value === "cr" || value === "attio" ? value : "b";
})();
