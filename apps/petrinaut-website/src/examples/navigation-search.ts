/**
 * Projects the example URL contract onto Petrinaut's navigation state. The
 * editor navigates more than the URL carries (mode, Simulate section,
 * overlays), so those fields take editor defaults here and live in page state
 * instead — see `useSharedSearchNavigation`.
 */
import { defaultPetrinautNavigationState } from "@hashintel/petrinaut/react";

import {
  selectionFromInput,
  selectionToSearch,
  type SharedExampleSearch,
} from "./example-search";

import type { PetrinautNavigationState } from "@hashintel/petrinaut/react";

/** `none` is an explicit no-scenario choice; absence means "first available". */
const scenarioFromSearch = (
  search: SharedExampleSearch,
): string | null | undefined => {
  if (search.scenario === undefined) {
    return undefined;
  }
  return search.scenario === "none" ? null : search.scenario;
};

const scenarioToSearch = (
  scenarioId: string | null | undefined,
): string | undefined => (scenarioId === null ? "none" : scenarioId);

export const sharedSearchToNavigationState = (
  search: SharedExampleSearch,
): PetrinautNavigationState => ({
  ...defaultPetrinautNavigationState,
  scenarioId: scenarioFromSearch(search),
  subnetId: search.subnet ?? null,
  selection: selectionFromInput(search as Record<string, unknown>),
});

export const navigationStateToSharedSearch = (
  state: Readonly<PetrinautNavigationState>,
): SharedExampleSearch => ({
  scenario: scenarioToSearch(state.scenarioId),
  subnet: state.subnetId ?? undefined,
  ...selectionToSearch(state.selection),
});
