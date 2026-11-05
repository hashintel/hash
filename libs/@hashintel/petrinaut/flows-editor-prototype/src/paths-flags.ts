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

export const pathsTake: PathsTake = (() => {
  const value = new URLSearchParams(globalThis.location.search).get("paths");
  return value === "i2" || value === "cr" || value === "attio" ? value : "b";
})();
