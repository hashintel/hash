/**
 * Projects the example URL contract onto Petrinaut's navigation state.
 *
 * The URL carries the selected scenario, subnet, focused item, expanded
 * properties section, editor mode, Simulate section, open record, overlay
 * and panel presentation.
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
  type SharedEditView,
  type SharedMode,
  type SharedOverlay,
  type SharedSimulateView,
} from "./example-search";

import type { PetrinautPreviewNavigationState } from "@hashintel/petrinaut/preview";
import type {
  EditorGlobalMode,
  EditViewMode,
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
const editViewToSearch = (view: EditViewMode): SharedEditView => view;

const modeToSearch = (mode: EditorGlobalMode): SharedMode => mode;

const simulateViewToSearch = (view: SimulateViewMode): SharedSimulateView =>
  view;

const overlayToSearch = (
  overlay: PetrinautNavigationOverlay,
): SharedOverlay | undefined => overlay?.type;

const overlayFromSearch = (
  overlay: SharedOverlay,
  section: SharedExampleSearch["settings"],
): PetrinautNavigationOverlay =>
  overlay === "user-settings" ? { type: overlay, section } : { type: overlay };

export const sharedSearchToNavigationState = (
  search: SharedExampleSearch,
  baseline: PetrinautNavigationState = defaultPetrinautNavigationState,
): PetrinautNavigationState => ({
  ...baseline,
  scenarioId: scenarioFromSearch(search),
  subnetId: search.subnet ?? null,
  selection: selectionFromInput(search as Record<string, unknown>),
  editView: search.editView ?? baseline.editView,
  expandedSubView:
    search.expandedPanel && search.expandedSection
      ? { container: search.expandedPanel, id: search.expandedSection }
      : null,
  mode:
    search.mode ??
    (search.resourceType && search.resourceId ? "simulate" : baseline.mode),
  simulateView:
    search.resourceType && search.resourceId
      ? search.resourceType === "scenario"
        ? "scenarios"
        : search.resourceType === "experiment"
          ? "experiments"
          : "metrics"
      : (search.view ?? baseline.simulateView),
  simulateResource:
    search.resourceType && search.resourceId
      ? { type: search.resourceType, id: search.resourceId }
      : baseline.simulateResource,
  simulatePresentation: search.presentation ?? baseline.simulatePresentation,
  overlay:
    search.overlay === undefined
      ? baseline.overlay
      : overlayFromSearch(search.overlay, search.settings),
});

export const navigationStateToSharedSearch = (
  state: Readonly<PetrinautNavigationState>,
  baseline: PetrinautNavigationState = defaultPetrinautNavigationState,
): SharedExampleSearch => {
  const mode = modeToSearch(state.mode);
  const editView = editViewToSearch(state.editView);
  const view = simulateViewToSearch(state.simulateView);
  const overlay = overlayToSearch(state.overlay);
  const canExpand =
    state.simulateResource?.type === "scenario" ||
    state.simulateResource?.type === "experiment" ||
    overlay === "create-scenario" ||
    overlay === "create-experiment";
  return {
    resourceType: state.simulateResource?.type,
    resourceId: state.simulateResource?.id,
    presentation:
      canExpand && state.simulatePresentation === "fullscreen"
        ? "fullscreen"
        : undefined,
    scenario: scenarioToSearch(state.scenarioId),
    subnet: state.subnetId ?? undefined,
    expandedPanel: state.expandedSubView?.container,
    expandedSection: state.expandedSubView?.id,
    // Omitted at the baseline, so an untouched page keeps a clean URL and the
    // decode above puts the baseline back.
    mode: mode === modeToSearch(baseline.mode) ? undefined : mode,
    editView:
      editView === editViewToSearch(baseline.editView) ? undefined : editView,
    view:
      view === simulateViewToSearch(baseline.simulateView) ? undefined : view,
    overlay:
      overlay === overlayToSearch(baseline.overlay) ? undefined : overlay,
    settings:
      state.overlay?.type === "user-settings"
        ? state.overlay.section
        : undefined,
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

/**
 * Applies a Preview navigation to a search, keeping the fields the Preview
 * does not navigate.
 *
 * Writing the projection alone would drop `mode`, `view` and `overlay` on the
 * first selection, and an embed can arrive carrying them: oEmbed copies the
 * source page's `mode` into the iframe URL. A surface that does not understand
 * a field must not destroy it.
 */
export const applyPreviewNavigationUpdate = (
  search: SharedExampleSearch,
  update: PetrinautNavigationUpdater<PetrinautPreviewNavigationState>,
): SharedExampleSearch => ({
  mode: search.mode,
  editView: search.editView,
  view: search.view,
  overlay: search.overlay,
  settings: search.settings,
  expandedPanel: search.expandedPanel,
  expandedSection: search.expandedSection,
  resourceType: search.resourceType,
  resourceId: search.resourceId,
  presentation: search.presentation,
  ...navigationStateToPreviewSearch(
    update(previewSearchToNavigationState(search)),
  ),
});
