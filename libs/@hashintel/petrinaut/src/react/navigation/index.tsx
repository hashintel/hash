/**
 * @layerRoot react.navigation
 * @role Keeps Petrinaut's app location router-neutral and controlled by the host
 */

import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { canonicalizeSelection } from "@hashintel/petrinaut-core/selection";

import { ActualModeContext } from "../actual-mode-context";

import type {
  EditorGlobalMode,
  SimulateDrawerState,
  SimulateViewMode,
} from "../state/editor-context";
import type { SelectionItem } from "@hashintel/petrinaut-core";

export type PetrinautSimulateResource =
  | { type: "scenario"; id: string }
  | { type: "metric"; id: string }
  | { type: "experiment"; id: string }
  | { type: "optimization"; id: string }
  | { type: "status-view"; id: string };

export type PetrinautNavigationOverlay =
  | { type: "viewport-settings" }
  | { type: "create-scenario" }
  | { type: "create-metric" }
  | { type: "create-experiment" }
  | { type: "create-optimization" }
  | { type: "create-status-view" }
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
  simulateView: SimulateViewMode;
  simulateResource: PetrinautSimulateResource | null;
  scenarioId: string | null | undefined;
  subnetId: string | null;
  selection: readonly SelectionItem[];
  overlay: PetrinautNavigationOverlay;
};

export const defaultPetrinautNavigationState: PetrinautNavigationState = {
  mode: "edit",
  simulateView: "experiments",
  simulateResource: null,
  scenarioId: undefined,
  subnetId: null,
  selection: [],
  overlay: null,
};

export type PetrinautNavigationHistory = "push" | "replace";

export type PetrinautNavigationAction =
  | "mode"
  | "simulation-view"
  | "simulation-resource"
  | "scenario"
  | "subnet"
  | "selection"
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

type PetrinautNavigationContextValue = {
  controlled: boolean;
  state: Readonly<PetrinautNavigationState>;
  navigate: (
    update: PetrinautNavigationUpdate<PetrinautNavigationState>,
    intent: PetrinautNavigationIntent,
  ) => boolean;
};

const PetrinautNavigationContext =
  createContext<PetrinautNavigationContextValue>({
    controlled: false,
    state: defaultPetrinautNavigationState,
    navigate: () => false,
  });

export type PetrinautNavigationProviderProps = {
  children: ReactNode;
  controller?: PetrinautNavigationController;
  initialState?: Partial<PetrinautNavigationState>;
};

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
  left.simulateView === right.simulateView &&
  left.simulateResource?.type === right.simulateResource?.type &&
  left.simulateResource?.id === right.simulateResource?.id &&
  left.scenarioId === right.scenarioId &&
  left.subnetId === right.subnetId &&
  selectionsMatch(left.selection, right.selection) &&
  left.overlay?.type === right.overlay?.type;

const resolveNavigationUpdate = (
  current: Readonly<PetrinautNavigationState>,
  update: PetrinautNavigationUpdate<PetrinautNavigationState>,
): PetrinautNavigationState => {
  const updated =
    typeof update === "function" ? update(current) : { ...current, ...update };

  return {
    ...updated,
    selection: canonicalizeSelection(updated.selection),
  };
};

export const PetrinautNavigationProvider = ({
  children,
  controller,
  initialState,
}: PetrinautNavigationProviderProps) => {
  const actualMode = use(ActualModeContext);
  const [uncontrolledState, setUncontrolledState] =
    useState<PetrinautNavigationState>(() => ({
      ...defaultPetrinautNavigationState,
      ...(actualMode.available ? { mode: "actual" as const } : {}),
      ...initialState,
      selection: canonicalizeSelection(initialState?.selection ?? []),
    }));
  const state = controller?.state ?? uncontrolledState;
  /**
   * React normally rerenders after navigation, but several UI libraries emit
   * related callbacks in the same event. Track the state those accepted
   * callbacks imply so a later callback is compared with the earlier result,
   * rather than with a stale render-time value. A controlled host still gets
   * the updater and applies it to its own freshest state.
   *
   * The preview is kept with the `base` it was derived from, and dropped only
   * once the host's state has moved off that base. A host backed by a router
   * applies on a later tick, and any unrelated rerender in that window would
   * otherwise roll the base back to the state the host was already asked to
   * leave, so the next update would compare equal and never be sent.
   *
   * `fresh` marks the preview as belonging to the event that produced it.
   * Suppressing a repeat is only right within that event: a host that declines
   * an update (a navigation guard, an aborted transition) changes nothing and
   * so never rerenders, and the user's retry must still reach it.
   */
  const optimisticRef = useRef<{
    base: PetrinautNavigationState;
    preview: PetrinautNavigationState;
    fresh: boolean;
  } | null>(null);
  const freshnessTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useLayoutEffect(() => {
    const optimistic = optimisticRef.current;
    if (optimistic && !petrinautNavigationStatesMatch(optimistic.base, state)) {
      optimisticRef.current = null;
    }
  });
  useEffect(() => () => clearTimeout(freshnessTimerRef.current), []);

  const navigate: PetrinautNavigationContextValue["navigate"] = (
    update,
    intent,
  ) => {
    const updater: PetrinautNavigationUpdater<PetrinautNavigationState> = (
      current,
    ) => resolveNavigationUpdate(current, update);
    const optimistic = optimisticRef.current;
    const current = optimistic?.preview ?? state;
    const preview = updater(current);
    if (
      (optimistic === null || optimistic.fresh) &&
      petrinautNavigationStatesMatch(current, preview)
    ) {
      return false;
    }

    optimisticRef.current = {
      base: optimistic?.base ?? state,
      preview,
      fresh: true,
    };
    clearTimeout(freshnessTimerRef.current);
    freshnessTimerRef.current = setTimeout(() => {
      const pending = optimisticRef.current;
      if (pending) {
        optimisticRef.current = { ...pending, fresh: false };
      }
    }, 0);

    if (controller) {
      controller.onNavigate(updater, {
        history:
          controller.historyPolicy?.(intent) ??
          defaultPetrinautNavigationHistoryPolicy(intent),
        intent,
      });
    } else {
      setUncontrolledState((latest) => {
        const next = updater(latest);
        return petrinautNavigationStatesMatch(latest, next) ? latest : next;
      });
    }
    return true;
  };

  return (
    <PetrinautNavigationContext
      value={{ controlled: controller != null, navigate, state }}
    >
      {children}
    </PetrinautNavigationContext>
  );
};

/** Internal bridge used by state providers; exported for custom React shells. */
export const usePetrinautNavigation = () => use(PetrinautNavigationContext);

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
    case "optimization":
      return "optimizations";
    case "status-view":
      return "status-views";
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

export const openPetrinautSubnet =
  (
    subnetId: string | null,
  ): PetrinautNavigationUpdater<PetrinautNavigationState> =>
  (current) => ({ ...current, subnetId, selection: [] });

export const simulateDrawerToNavigationResource = (
  drawer: SimulateDrawerState,
  current: Readonly<PetrinautNavigationState>,
): PetrinautSimulateResource | null => {
  switch (drawer.type) {
    case "view-scenario":
      return { type: "scenario", id: drawer.scenarioId };
    case "view-metric":
      return { type: "metric", id: drawer.metricId };
    case "view-experiment":
      return { type: "experiment", id: drawer.experimentId };
    case "view-status-view":
      return { type: "status-view", id: drawer.statusViewId };
    // A create drawer opens above whatever record is already open, the way
    // `simulateDrawerToNavigationOverlay` keeps the overlay behind it.
    case "create-scenario":
    case "create-metric":
    case "create-experiment":
    case "create-optimization":
    case "create-status-view":
      return current.simulateResource;
    // `closed` means whichever drawer is on top. Closing a create overlay
    // reveals the record it was layered over; closing that record's own
    // drawer clears it.
    case "closed":
      return current.overlay?.type.startsWith("create-")
        ? current.simulateResource
        : null;
  }
};

export const simulateDrawerToNavigationOverlay = (
  drawer: SimulateDrawerState,
  current: PetrinautNavigationOverlay,
): PetrinautNavigationOverlay => {
  switch (drawer.type) {
    case "create-scenario":
    case "create-metric":
    case "create-experiment":
    case "create-optimization":
    case "create-status-view":
      return { type: drawer.type };
    case "closed":
    case "view-scenario":
    case "view-metric":
    case "view-experiment":
    case "view-status-view":
      return current?.type.startsWith("create-") ? null : current;
  }
};

export const navigationResourceToSimulateDrawer = (
  resource: PetrinautSimulateResource | null,
  overlay: PetrinautNavigationOverlay = null,
): SimulateDrawerState => {
  switch (overlay?.type) {
    case "create-scenario":
    case "create-metric":
    case "create-experiment":
    case "create-optimization":
    case "create-status-view":
      return { type: overlay.type };
    case "viewport-settings":
    case undefined:
      break;
  }
  switch (resource?.type) {
    case "scenario":
      return { type: "view-scenario", scenarioId: resource.id };
    case "metric":
      return { type: "view-metric", metricId: resource.id };
    case "experiment":
      return { type: "view-experiment", experimentId: resource.id };
    case "status-view":
      return { type: "view-status-view", statusViewId: resource.id };
    case "optimization":
    case undefined:
      return { type: "closed" };
  }
};
