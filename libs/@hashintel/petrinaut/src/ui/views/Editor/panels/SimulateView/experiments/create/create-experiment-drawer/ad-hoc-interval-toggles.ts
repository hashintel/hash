/**
 * Whether the ad-hoc form has an interval toggle on, read from its state
 * alone. The drawer keeps the Objective section and its Optimize word on
 * that, not on whether the definition synthesizes yet: a bound mid-edit
 * must not unmount the section beneath it.
 */
import type { AdHocScenarioState, AdHocValue } from "@hashintel/petrinaut-core";

const isToggled = (value: AdHocValue): boolean => value.optimize !== null;

export const hasAdHocIntervalToggle = (state: AdHocScenarioState): boolean =>
  state.variables.some(isToggled) ||
  state.netParameters.some(isToggled) ||
  Object.values(state.places).some((place) =>
    place.kind === "uncoloured"
      ? isToggled(place.count)
      : place.variables.some(isToggled) ||
        Object.values(place.sharedColumns).some(isToggled) ||
        place.rows.some(
          (row) =>
            row.cells.some(isToggled) ||
            (row.kind === "template" && isToggled(row.count)),
        ),
  );
