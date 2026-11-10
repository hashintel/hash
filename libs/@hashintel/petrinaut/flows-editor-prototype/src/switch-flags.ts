/**
 * Two inbox takes on the `node-paths` demo flow (5 Nov), read from the URL only. With neither param the If panel and
 * the mock Switch look as they do today.
 *
 * `?ifrename=` (inbox `if-rename-description`). If is binary since Ciarán's rule (Slack, 5 Nov 11:20), so its No path
 * is the catch-all the card calls Otherwise. Path names are edited in place on hover (Attio), with no pen, and the
 * canvas port takes the name. The step's description is the header's in-place line in both.
 * - `a`: Yes is renamable; No, the catch-all, stays fixed text. A Switch's Default stays fixed too.
 * - `b`: as `a`, and No and a Switch's Default can be renamed as well.
 *
 * `?switch=` (inbox `switch-panel`): how the mock Switch "Route by supplier region" picks its cases. Selecting it
 * shows the take's panel.
 * - `s1`: cases come from the Region field's options, one per option (Oceania included), then Default.
 * - `s2`: cases are set in the block; each matches one or more Region values, shown as chips.
 * - `s3`: Attio's model, Ciarán's rule: each case is a condition set with an in-place name, checked top to bottom,
 *   then an optional Default. With Default off and a Region value no case covers, a faint warning says the cases
 *   aren't exhaustive.
 * - `s4`: no Switch step. The step that finds the batch's supplier splits by Region itself: Find entities with a
 *   Paths section.
 */
export type IfRenameTake = "a" | "b";
export type SwitchTake = "s1" | "s2" | "s3" | "s4";

const query = new URLSearchParams(globalThis.location.search);

export const ifRenameTake: IfRenameTake | null = (() => {
  const value = query.get("ifrename");
  return value === "a" || value === "b" ? value : null;
})();

export const switchTake: SwitchTake | null = (() => {
  const value = query.get("switch");
  return value === "s1" || value === "s2" || value === "s3" || value === "s4"
    ? value
    : null;
})();

/** Whether a path's name can be renamed in place: the catch-all (If's No, a Switch's Default) only with `b`. */
export const pathRenamable = (outputName: string) =>
  ifRenameTake !== null &&
  (ifRenameTake === "b" ||
    (outputName !== "false" && outputName !== "default"));

/** The Region field's options, as the demo supplier entity type would list them. */
export const regionValues = ["Europe", "Americas", "Asia", "Africa", "Oceania"];

/** The demo Switch's paths per take; `s1` has one per Region option. */
export const switchPorts = (
  take: SwitchTake | null,
): { outputName: string; label: string }[] => [
  { outputName: "europe", label: "Europe" },
  { outputName: "americas", label: "Americas" },
  { outputName: "asia", label: "Asia" },
  { outputName: "africa", label: "Africa" },
  ...(take === "s1" || take === "s4"
    ? [{ outputName: "oceania", label: "Oceania" }]
    : []),
  { outputName: "default", label: "Default" },
];

/** A step's paths as its card and panel show them: renamed paths take their names; Default goes when turned off. */
export const namedPorts = (
  step: { pathNames?: Record<string, string>; noDefault?: boolean },
  ports: { outputName: string; label: string }[],
) =>
  ports
    .filter((port) => !(step.noDefault && port.outputName === "default"))
    .map((port) => ({
      ...port,
      label: step.pathNames?.[port.outputName] ?? port.label,
    }));

/**
 * `?switchlayout=` (inbox `condition-panels-layout`, 10 Nov): one condition layout for the If, Switch (S3) and Find
 * entities panels. Any value also fills the demo's If and Find entities conditions, so every take shows the same
 * rows. With no param the panels look as they do today.
 * - `today`: today's layout, with the demo conditions filled.
 * - `a`: today's structure, aligned: the joiner in the panel's label column, chips and the Add button in the value
 *   column, 8 px between condition rows, 16 px before the Add button, the Switch's chips with the row ⋮ and its Add
 *   button outlined like Add filter; case names regular, as I1's path names; even 16 px around every hairline.
 * - `b`: as `a`, with the Add button under the joiner, at the panel's left edge, as the DS Filter draws its footer
 *   (Figma DS `42423:56345`).
 * - `c`: the DS Filter's own grammar: a 64 px joiner column (Figma DS `41967:40965`), so the chips start 72 px in and
 *   get the panel's full width; the Add button at the left edge. Fields keep the panel's label column.
 */
export type SwitchLayout = "today" | "a" | "b" | "c";

export const switchLayout: SwitchLayout | null = (() => {
  const value = query.get("switchlayout");
  return value === "today" || value === "a" || value === "b" || value === "c"
    ? value
    : null;
})();

/** The take's layout for condition rows; null for today's (no param, or `today`). */
export const conditionLayout =
  switchLayout === "today" ? null : switchLayout;

/**
 * `?joiner=` (inbox `condition-panels-layout`, second question, 10 Nov): how AND / OR shows under "Where", in the If,
 * Switch and Find entities panels, with any `?switchlayout=`. No param: today's outlined select ("AND ⌄").
 * - `j1`: plain muted text in the label column, as "Where" (13 px regular, lowercase "and" / "or"); a chevron shows on
 *   hover; a click opens the same menu.
 * - `j2`: a DS xs ghost Button (24 px), lowercase, muted, its text level with "Where".
 * - `j3`: set once: "Where all of these match ⌄" above the rows, and the rows carry no joiner (Linear, Notion).
 */
export type JoinerTake = "j1" | "j2" | "j3";

export const joinerTake: JoinerTake | null = (() => {
  const value = query.get("joiner");
  return value === "j1" || value === "j2" || value === "j3" ? value : null;
})();
