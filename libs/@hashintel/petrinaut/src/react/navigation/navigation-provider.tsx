import { use, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { canonicalizeSelection } from "@hashintel/petrinaut-core/selection";

import { ActualModeContext } from "../actual-mode-context";
import { usePublished } from "../select-from-context";
import {
  defaultPetrinautNavigationHistoryPolicy,
  defaultPetrinautNavigationState,
  PetrinautNavigationContext,
  PetrinautNavigationPublishedContext,
  petrinautNavigationStatesMatch,
  resolveNavigationUpdate,
} from "./navigation";

import type { SimulateViewMode } from "../state/editor-context";
import type {
  PetrinautNavigationContextValue,
  PetrinautNavigationController,
  PetrinautNavigationState,
  PetrinautNavigationUpdater,
} from "./navigation";

type SimulationVisits = Partial<
  Record<
    SimulateViewMode,
    Pick<PetrinautNavigationState, "simulateResource" | "simulatePresentation">
  >
>;

export type PetrinautNavigationProviderProps = {
  children: ReactNode;
  controller?: PetrinautNavigationController;
  initialState?: Partial<PetrinautNavigationState>;
};

/**
 * Runs `commit` first in the layout phase of a commit: a leaf before the
 * provider's children, so its layout effect runs before any of theirs.
 */
const CommitLocation = ({ commit }: { commit: () => void }) => {
  useLayoutEffect(commit);
  return null;
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
  // What `navigate` reads, written first in the layout phase of every commit,
  // so a layout effect below that navigates is compared with that commit.
  // `navigate` closes over nothing a render changes: it is one function for
  // the provider's life.
  const latestRef = useRef<{
    state: PetrinautNavigationState;
    controller: PetrinautNavigationController | undefined;
    /** The record each Simulate section was last seen with. */
    visits: SimulationVisits;
  }>({ state, controller, visits: {} });
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
  const commitLocation = () => {
    const { visits } = latestRef.current;
    const visit = visits[state.simulateView];
    latestRef.current = {
      state,
      controller,
      // Replaced, not written to: an updater a host applies later keeps the
      // visits of the call that made it.
      visits:
        visit !== undefined &&
        visit.simulateResource?.type === state.simulateResource?.type &&
        visit.simulateResource?.id === state.simulateResource?.id &&
        visit.simulatePresentation === state.simulatePresentation
          ? visits
          : {
              ...visits,
              [state.simulateView]: {
                simulateResource: state.simulateResource,
                simulatePresentation: state.simulatePresentation,
              },
            },
    };
    const optimistic = optimisticRef.current;
    if (optimistic && !petrinautNavigationStatesMatch(optimistic.base, state)) {
      optimisticRef.current = null;
    }
  };

  const navigate: PetrinautNavigationContextValue["navigate"] = (
    update,
    intent,
  ) => {
    const { state: committed, controller: host, visits } = latestRef.current;
    const updater: PetrinautNavigationUpdater<PetrinautNavigationState> = (
      current,
    ) => {
      const next = resolveNavigationUpdate(current, update);
      if (
        intent.cause === "user" &&
        intent.action === "simulation-view" &&
        next.simulateView !== current.simulateView
      ) {
        return {
          ...next,
          simulateResource: visits[next.simulateView]?.simulateResource ?? null,
          simulatePresentation: visits[next.simulateView]?.simulatePresentation,
          overlay: null,
        };
      }
      return next;
    };
    const optimistic = optimisticRef.current;
    const current = optimistic?.preview ?? committed;
    const preview = updater(current);
    if (
      (optimistic === null || optimistic.fresh) &&
      petrinautNavigationStatesMatch(current, preview)
    ) {
      return false;
    }

    optimisticRef.current = {
      base: optimistic?.base ?? committed,
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

    if (host) {
      host.onNavigate(updater, {
        history:
          host.historyPolicy?.(intent) ??
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

  const value = { controlled: controller != null, navigate, state };
  const published = usePublished(value);

  return (
    <PetrinautNavigationPublishedContext value={published}>
      <PetrinautNavigationContext value={value}>
        <CommitLocation commit={commitLocation} />
        {children}
      </PetrinautNavigationContext>
    </PetrinautNavigationPublishedContext>
  );
};
