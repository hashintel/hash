/**
 * Projects the example URL contract onto Petrinaut's navigation state.
 *
 * The URL carries the location a reader can act on: the scenario, the subnet,
 * the focused item, the editor's mode, its Simulate section, and the overlay it
 * has open. It deliberately leaves out `simulateResource`, which names a run or
 * a record inside the open document rather than a place in the app.
 *
 * Every field is decoded against a BASELINE — the location its page starts
 * from. A URL that does not name a field means "the baseline's value", which is
 * what makes Back undo a mode change or close an overlay: the entry Back
 * returns to simply omits the field. The baseline is the editor's own default
 * everywhere except `/brunch`, which starts in Actual mode.
 */
import { defaultPetrinautNavigationState } from "@hashintel/petrinaut/react";

import {
  selectionFromInput,
  selectionToSearch,
  type SharedExampleSearch,
  type SharedMode,
  type SharedOverlay,
  type SharedSimulateView,
} from "./example-search";

import type { PetrinautPreviewNavigationState } from "@hashintel/petrinaut/preview";
import type {
  EditorGlobalMode,
  PetrinautNavigationOverlay,
  PetrinautNavigationState,
  PetrinautNavigationUpdater,
  SimulateViewMode,
} from "@hashintel/petrinaut/react";

/** `none` is an explicit no-scenario choice; absence means "first available". */
const scenarioFromSearch = (
  search: SharedExampleSearch,
): string | null | undefined => {
  if (search.scenario === undefined) {
    return undefined;
  }
  return search.scenario === "none" ? null : search.scenario;
};

export const previewSearchToNavigationState = (
  search: SharedExampleSearch,
): PetrinautPreviewNavigationState => ({
  scenarioId: scenarioFromSearch(search),
  subnetId: search.subnet ?? null,
  selection: selectionFromInput(search as Record<string, unknown>),
});

const scenarioToSearch = (
  scenarioId: string | null | undefined,
): string | undefined => (scenarioId === null ? "none" : scenarioId);

/**
 * The editor's vocabularies, narrowed to the contract's. These are assignments
 * rather than casts, so adding a mode, a Simulate section or an overlay to the
 * editor fails this file's type check until the contract decides whether the
 * URL should carry it.
 */
const modeToSearch = (mode: EditorGlobalMode): SharedMode => mode;

const simulateViewToSearch = (view: SimulateViewMode): SharedSimulateView =>
  view;

const overlayToSearch = (
  overlay: PetrinautNavigationOverlay,
): SharedOverlay | undefined => overlay?.type;

const overlayFromSearch = (
  overlay: SharedOverlay,
): PetrinautNavigationOverlay => ({ type: overlay });

export const sharedSearchToNavigationState = (
  search: SharedExampleSearch,
  baseline: PetrinautNavigationState = defaultPetrinautNavigationState,
): PetrinautNavigationState => ({
  ...baseline,
  scenarioId: scenarioFromSearch(search),
  subnetId: search.subnet ?? null,
  selection: selectionFromInput(search as Record<string, unknown>),
  mode: search.mode ?? baseline.mode,
  simulateView: search.view ?? baseline.simulateView,
  overlay:
    search.overlay === undefined
      ? baseline.overlay
      : overlayFromSearch(search.overlay),
});

export const navigationStateToSharedSearch = (
  state: Readonly<PetrinautNavigationState>,
  baseline: PetrinautNavigationState = defaultPetrinautNavigationState,
): SharedExampleSearch => {
  const mode = modeToSearch(state.mode);
  const view = simulateViewToSearch(state.simulateView);
  const overlay = overlayToSearch(state.overlay);
  return {
    scenario: scenarioToSearch(state.scenarioId),
    subnet: state.subnetId ?? undefined,
    // Omitted at the baseline, so an untouched page keeps a clean URL and the
    // decode above puts the baseline back.
    mode: mode === modeToSearch(baseline.mode) ? undefined : mode,
    view:
      view === simulateViewToSearch(baseline.simulateView) ? undefined : view,
    overlay:
      overlay === overlayToSearch(baseline.overlay) ? undefined : overlay,
    ...selectionToSearch(state.selection),
  };
};

/**
 * The Preview navigates a narrower location than the editor — no mode, no
 * Simulate section, no overlay — so its projection is only the three fields it
 * has.
 */
export const navigationStateToPreviewSearch = (
  state: Readonly<PetrinautPreviewNavigationState>,
): SharedExampleSearch => ({
  scenario: scenarioToSearch(state.scenarioId),
  subnet: state.subnetId ?? undefined,
  ...selectionToSearch(state.selection),
});

export const applyPreviewNavigationUpdate = (
  search: SharedExampleSearch,
  update: PetrinautNavigationUpdater<PetrinautPreviewNavigationState>,
): SharedExampleSearch =>
  navigationStateToPreviewSearch(
    update(previewSearchToNavigationState(search)),
  );
