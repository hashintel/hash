import type { StatusViewFormState } from "./status-view-form";
import type { StatusView } from "@hashintel/petrinaut-core";

/**
 * Build a `StatusView` from the form state. Label order is the form's row
 * order; empty descriptions and conditions are dropped rather than stored as
 * empty strings, and an exit label's places are always empty.
 *
 * @param state - the form state
 * @param id - the status view id (a new UUID for new views, the existing
 *   view's id when updating)
 */
export function buildStatusViewFromFormState(
  state: StatusViewFormState,
  id: string,
): StatusView {
  return {
    id,
    name: state.name.trim(),
    description: state.description.trim() || undefined,
    identityRef: state.identityRef,
    labels: state.labels.map((label) => ({
      id: label.id,
      name: label.name.trim(),
      displayColor: label.displayColor,
      places: label.isExit ? [] : [...label.places],
      ...(label.tokenCondition.trim() === "" || label.isExit
        ? {}
        : { tokenCondition: label.tokenCondition }),
      ...(label.isExit ? { isExit: true } : {}),
    })),
  };
}
