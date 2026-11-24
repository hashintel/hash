/**
 * @layerRoot react.navigation
 * @role Keeps Petrinaut's app location router-neutral and controlled by the host
 */

import { createContext, use } from "react";

import { canonicalizeSelection } from "@hashintel/petrinaut-core/selection";

import { useSelected, type Published } from "../shared/select-from-context";

import type { SelectionItem } from "@hashintel/petrinaut-core";

/** Which of the editor's three workspaces the location shows. */
export type EditorGlobalMode = "edit" | "simulate" | "actual";
/** Which view of the net Edit mode shows. */
export type EditViewMode = "canvas" | "definitions";
/** Which section of Simulate mode the location shows. */
export type SimulateViewMode = "scenarios" | "metrics" | "experiments";

export type PetrinautSimulateResource =
  | { type: "scenario"; id: string }
  | { type: "metric"; id: string }
  | { type: "experiment"; id: string };

export type PetrinautSettingsSection =
  | "general"
  | "viewport"
  | "plugins"
  | "labs";

export type PetrinautNavigationOverlay =
  | { type: "user-settings"; section?: PetrinautSettingsSection }
  | { type: "viewport-settings" }
  | { type: "create-scenario" }
  | { type: "create-metric" }
  | { type: "create-experiment" }
  | null;

/**
 * App location understood by the full editor. Hosts can encode this in any
 * router they choose; Petrinaut itself never imports a router.
 *
 * `scenarioId: undefined` means "use the first available scenario", while
 * `null` means that the user explicitly selected no scenario.
 */
export type PetrinautNavigationState = {
  mode: EditorGlobalMode;
  editView: EditViewMode;
  simulateView: SimulateViewMode;
  simulateResource: PetrinautSimulateResource | null;
  /** Omission uses the panel presentation, including in existing host controllers. */
  simulatePresentation?: "panel" | "fullscreen";
  scenarioId: string | null | undefined;
  componentId: string | null;
  selection: readonly SelectionItem[];
  expandedSubView: { container: string; id: string } | null;
  overlay: PetrinautNavigationOverlay;
};

export const defaultPetrinautNavigationState: PetrinautNavigationState = {
  mode: "edit",
  editView: "canvas",
  simulateView: "experiments",
  simulateResource: null,
  scenarioId: undefined,
  componentId: null,
  selection: [],
  expandedSubView: null,
  overlay: null,
};

export type PetrinautNavigationHistory = "push" | "replace";

export type PetrinautNavigationAction =
  | "mode"
  | "edit-view"
  | "simulation-view"
  | "simulation-resource"
  | "simulation-presentation"
  | "scenario"
  | "component"
  | "selection"
  | "subview"
  | "overlay";

export type PetrinautNavigationIntent =
  | {
      cause: "user";
      action: PetrinautNavigationAction;
      phase?: "discrete" | "start" | "continue";
    }
  | {
      cause: "normalization";
      action: PetrinautNavigationAction;
    };

export type PetrinautNavigationUpdater<State extends object> = (
  current: Readonly<State>,
) => State;

export type PetrinautNavigationUpdate<State extends object> =
  | Partial<State>
  | PetrinautNavigationUpdater<State>;

export type PetrinautNavigationHistoryPolicy = (
  intent: PetrinautNavigationIntent,
) => PetrinautNavigationHistory;

export const defaultPetrinautNavigationHistoryPolicy: PetrinautNavigationHistoryPolicy =
  (intent) =>
    intent.cause === "normalization" || intent.phase === "continue"
      ? "replace"
      : "push";

export type PetrinautNavigationController<
  State extends object = PetrinautNavigationState,
> = {
  state: Readonly<State>;
  /** Allows a host such as an iframe to constrain how navigation is recorded. */
  historyPolicy?: PetrinautNavigationHistoryPolicy;
  /**
   * Apply an updater to the host's freshest state. Passing the updater rather
   * than a render-time snapshot makes concurrent and functional transitions
   * safe for host routers.
   *
   * A host may apply the update on a later tick, and may decline it outright.
   * It should ignore an update that resolves to the state it already holds,
   * so that a decline and a repeated request stay distinguishable.
   */
  onNavigate: (
    update: PetrinautNavigationUpdater<State>,
    options: {
      history: PetrinautNavigationHistory;
      intent: PetrinautNavigationIntent;
    },
  ) => void;
};

export type PetrinautNavigationContextValue = {
  controlled: boolean;
  state: Readonly<PetrinautNavigationState>;
  navigate: (
    update: PetrinautNavigationUpdate<PetrinautNavigationState>,
    intent: PetrinautNavigationIntent,
  ) => boolean;
};

export const PetrinautNavigationContext =
  createContext<PetrinautNavigationContextValue>({
    controlled: false,
    state: defaultPetrinautNavigationState,
    navigate: () => false,
  });

/** Where the provider publishes the location for the readers by part. */
export const PetrinautNavigationPublishedContext =
  createContext<Published<PetrinautNavigationContextValue>>(null);

const selectionsMatch = (
  left: readonly SelectionItem[],
  right: readonly SelectionItem[],
) =>
  left.length === right.length &&
  left.every((item, index) => {
    const rightItem = right[index]!;
    return item.type === rightItem.type && item.id === rightItem.id;
  });

export const petrinautNavigationStatesMatch = (
  left: Readonly<PetrinautNavigationState>,
  right: Readonly<PetrinautNavigationState>,
) =>
  left.mode === right.mode &&
  left.editView === right.editView &&
  left.simulateView === right.simulateView &&
  left.simulateResource?.type === right.simulateResource?.type &&
  left.simulateResource?.id === right.simulateResource?.id &&
  (left.simulatePresentation ?? "panel") ===
    (right.simulatePresentation ?? "panel") &&
  left.scenarioId === right.scenarioId &&
  left.componentId === right.componentId &&
  selectionsMatch(left.selection, right.selection) &&
  left.expandedSubView?.container === right.expandedSubView?.container &&
  left.expandedSubView?.id === right.expandedSubView?.id &&
  left.overlay?.type === right.overlay?.type &&
  (left.overlay?.type !== "user-settings" ||
    right.overlay?.type !== "user-settings" ||
    (left.overlay.section ?? "general") ===
      (right.overlay.section ?? "general"));

export const resolveNavigationUpdate = (
  current: Readonly<PetrinautNavigationState>,
  update: PetrinautNavigationUpdate<PetrinautNavigationState>,
): PetrinautNavigationState => {
  const updated =
    typeof update === "function" ? update(current) : { ...current, ...update };
  const selection = canonicalizeSelection(updated.selection);
  const scopeChanged =
    updated.componentId !== current.componentId ||
    !selectionsMatch(selection, current.selection);

  return {
    ...updated,
    selection,
    expandedSubView:
      scopeChanged && updated.expandedSubView === current.expandedSubView
        ? null
        : updated.expandedSubView,
    simulatePresentation:
      updated.simulateResource?.type === "scenario" ||
      updated.simulateResource?.type === "experiment" ||
      updated.overlay?.type === "create-experiment" ||
      updated.overlay?.type === "create-scenario"
        ? updated.simulatePresentation
        : undefined,
  };
};

/** Internal bridge used by state providers; exported for custom React shells. */
export const usePetrinautNavigation = () => use(PetrinautNavigationContext);

/**
 * One part of the location. The reader renders when that part changes, where
 * `usePetrinautNavigation()` renders it for every navigation, a selection
 * included.
 *
 * ```tsx
 * const overlay = usePetrinautNavigationState((location) => location.overlay);
 * ```
 */
export const usePetrinautNavigationState = <Selected>(
  select: (location: Readonly<PetrinautNavigationState>) => Selected,
): Selected =>
  useSelected(
    PetrinautNavigationContext,
    PetrinautNavigationPublishedContext,
    (navigation) => select(navigation.state),
  );

/**
 * The function that changes the location. It keeps one identity for the
 * provider's life, so a component that only navigates renders for no
 * navigation.
 */
export const usePetrinautNavigate =
  (): PetrinautNavigationContextValue["navigate"] =>
    useSelected(
      PetrinautNavigationContext,
      PetrinautNavigationPublishedContext,
      (navigation) => navigation.navigate,
    );

const simulateResourceTypeToView = (
  type: PetrinautSimulateResource["type"],
): SimulateViewMode => {
  switch (type) {
    case "scenario":
      return "scenarios";
    case "metric":
      return "metrics";
    case "experiment":
      return "experiments";
  }
};

export const openPetrinautSimulationResource =
  (
    resource: PetrinautSimulateResource,
  ): PetrinautNavigationUpdater<PetrinautNavigationState> =>
  (current) => ({
    ...current,
    mode: "simulate",
    simulateView: simulateResourceTypeToView(resource.type),
    simulateResource: resource,
    overlay: null,
  });

export const openPetrinautComponent =
  (
    componentId: string | null,
  ): PetrinautNavigationUpdater<PetrinautNavigationState> =>
  (current) => ({ ...current, componentId, selection: [] });
