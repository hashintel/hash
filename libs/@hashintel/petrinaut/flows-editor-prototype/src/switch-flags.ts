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
