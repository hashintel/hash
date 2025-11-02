import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type { Place, SDCPN, Transition } from "../../core/types/sdcpn";
import { calculateGraphLayout } from "../lib/calculate-graph-layout";

const emptySDCPN: SDCPN = {
  id: "empty",
  title: "Untitled",
  places: [],
  transitions: [],
};

export type SDCPNState = {
  // The current SDCPN definition - always exists, never null
  sdcpn: SDCPN;
  setSDCPN: (sdcpn: SDCPN) => void;

  // Granular update methods
  updatePlace: (placeId: string, updates: Partial<Place>) => void;
  updatePlacePosition: (placeId: string, x: number, y: number) => void;
  addPlace: (place: Place) => void;
  removePlace: (placeId: string) => void;

  updateTransition: (
    transitionId: string,
    updates: Partial<Transition>
  ) => void;
  updateTransitionPosition: (
    transitionId: string,
    x: number,
    y: number
  ) => void;
  addTransition: (transition: Transition) => void;
  removeTransition: (transitionId: string) => void;

  addArc: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number
  ) => void;
  removeArc: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string
  ) => void;
  updateArcWeight: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number
  ) => void;

  updateTitle: (title: string) => void;

  // Delete multiple items by their IDs (supports places, transitions, and arcs)
  deleteItemsByIds: (ids: Set<string>) => void;

  // Layout the graph using an automatic layout algorithm
  layoutGraph: () => Promise<void>;
};

/**
 * Creates a Zustand store for managing the SDCPN definition.
 * This stores the core SDCPN model without any UI-specific state.
 */
export function createSDCPNStore() {
  return create<SDCPNState>()(
    devtools(
      (set, get) => ({
        sdcpn: emptySDCPN,
        setSDCPN: (sdcpn) => set({ sdcpn }, false, "setSDCPN"),

        // Place operations
        updatePlace: (placeId, updates) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.places = newSDCPN.places.map((place) =>
                place.id === placeId ? { ...place, ...updates } : place
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "updatePlace"
          ),

        updatePlacePosition: (placeId, x, y) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.places = newSDCPN.places.map((place) =>
                place.id === placeId ? { ...place, x, y } : place
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "updatePlacePosition"
          ),

        addPlace: (place) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.places = [...newSDCPN.places, place];

              return { sdcpn: newSDCPN };
            },
            false,
            "addPlace"
          ),

        removePlace: (placeId) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.places = newSDCPN.places.filter(
                (place) => place.id !== placeId
              );

              // Remove arcs connected to this place
              newSDCPN.transitions = newSDCPN.transitions.map((transition) => ({
                ...transition,
                inputArcs: transition.inputArcs.filter(
                  (arc) => arc.placeId !== placeId
                ),
                outputArcs: transition.outputArcs.filter(
                  (arc) => arc.placeId !== placeId
                ),
              }));

              return { sdcpn: newSDCPN };
            },
            false,
            "removePlace"
          ),

        // Transition operations
        updateTransition: (transitionId, updates) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.map((transition) =>
                transition.id === transitionId
                  ? { ...transition, ...updates }
                  : transition
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "updateTransition"
          ),

        updateTransitionPosition: (transitionId, x, y) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.map((transition) =>
                transition.id === transitionId
                  ? { ...transition, x, y }
                  : transition
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "updateTransitionPosition"
          ),

        addTransition: (transition) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = [...newSDCPN.transitions, transition];

              return { sdcpn: newSDCPN };
            },
            false,
            "addTransition"
          ),

        removeTransition: (transitionId) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.filter(
                (transition) => transition.id !== transitionId
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "removeTransition"
          ),

        // Arc operations
        addArc: (transitionId, arcType, placeId, weight) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.map((transition) => {
                if (transition.id !== transitionId) {
                  return transition;
                }

                const arc = { placeId, weight };
                if (arcType === "input") {
                  return {
                    ...transition,
                    inputArcs: [...transition.inputArcs, arc],
                  };
                }
                return {
                  ...transition,
                  outputArcs: [...transition.outputArcs, arc],
                };
              });

              return { sdcpn: newSDCPN };
            },
            false,
            "addArc"
          ),

        removeArc: (transitionId, arcType, placeId) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.map((transition) => {
                if (transition.id !== transitionId) {
                  return transition;
                }

                if (arcType === "input") {
                  return {
                    ...transition,
                    inputArcs: transition.inputArcs.filter(
                      (arc) => arc.placeId !== placeId
                    ),
                  };
                }
                return {
                  ...transition,
                  outputArcs: transition.outputArcs.filter(
                    (arc) => arc.placeId !== placeId
                  ),
                };
              });

              return { sdcpn: newSDCPN };
            },
            false,
            "removeArc"
          ),

        updateArcWeight: (transitionId, arcType, placeId, weight) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.map((transition) => {
                if (transition.id !== transitionId) {
                  return transition;
                }

                if (arcType === "input") {
                  return {
                    ...transition,
                    inputArcs: transition.inputArcs.map((arc) =>
                      arc.placeId === placeId ? { ...arc, weight } : arc
                    ),
                  };
                }
                return {
                  ...transition,
                  outputArcs: transition.outputArcs.map((arc) =>
                    arc.placeId === placeId ? { ...arc, weight } : arc
                  ),
                };
              });

              return { sdcpn: newSDCPN };
            },
            false,
            "updateArcWeight"
          ),

        updateTitle: (title) =>
          set(
            (state) => {
              return { sdcpn: { ...state.sdcpn, title } };
            },
            false,
            "updateTitle"
          ),

        deleteItemsByIds: (ids) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              const placeIdsToDelete = new Set<string>();
              const transitionIdsToDelete = new Set<string>();

              // Categorize IDs: separate places, transitions, and arcs
              for (const id of ids) {
                if (id.startsWith("$A_")) {
                  // This is an arc - parse and delete it
                  const parts = id.split("_");
                  const inputId = parts[1];
                  const outputId = parts[2];

                  if (!inputId || !outputId) {
                    continue;
                  }

                  // Determine if this is an input arc or output arc
                  const isInputPlace = state.sdcpn.places.some(
                    (place) => place.id === inputId,
                  );
                  const isOutputPlace = state.sdcpn.places.some(
                    (place) => place.id === outputId,
                  );

                  if (isInputPlace && !isOutputPlace) {
                    // Input arc: place -> transition
                    const transition = newSDCPN.transitions.find(
                      (tr) => tr.id === outputId,
                    );
                    if (transition) {
                      transition.inputArcs = transition.inputArcs.filter(
                        (arc) => arc.placeId !== inputId,
                      );
                    }
                  } else if (!isInputPlace && isOutputPlace) {
                    // Output arc: transition -> place
                    const transition = newSDCPN.transitions.find(
                      (tr) => tr.id === inputId,
                    );
                    if (transition) {
                      transition.outputArcs = transition.outputArcs.filter(
                        (arc) => arc.placeId !== outputId,
                      );
                    }
                  }
                } else {
                  // Check if it's a place or transition
                  const isPlace = state.sdcpn.places.some(
                    (place) => place.id === id,
                  );
                  if (isPlace) {
                    placeIdsToDelete.add(id);
                  } else {
                    transitionIdsToDelete.add(id);
                  }
                }
              }

              // Remove places and their connected arcs
              if (placeIdsToDelete.size > 0) {
                newSDCPN.places = newSDCPN.places.filter(
                  (place) => !placeIdsToDelete.has(place.id),
                );

                // Remove arcs connected to deleted places
                newSDCPN.transitions = newSDCPN.transitions.map((transition) => ({
                  ...transition,
                  inputArcs: transition.inputArcs.filter(
                    (arc) => !placeIdsToDelete.has(arc.placeId),
                  ),
                  outputArcs: transition.outputArcs.filter(
                    (arc) => !placeIdsToDelete.has(arc.placeId),
                  ),
                }));
              }

              // Remove transitions
              if (transitionIdsToDelete.size > 0) {
                newSDCPN.transitions = newSDCPN.transitions.filter(
                  (transition) => !transitionIdsToDelete.has(transition.id),
                );
              }

              return { sdcpn: newSDCPN };
            },
            false,
            "deleteItemsByIds",
          ),

        layoutGraph: async () => {
          const state = get();
          const { sdcpn } = state;

          if (sdcpn.places.length === 0) {
            return;
          }

          // Calculate new positions directly from SDCPN
          const positions = await calculateGraphLayout(sdcpn);

          // Update positions in SDCPN
          set(
            (currentState) => {
              const newSDCPN = { ...currentState.sdcpn };

              // Update place positions
              newSDCPN.places = newSDCPN.places.map((place) => {
                const position = positions.find((pos) => pos.id === place.id);
                if (position) {
                  return { ...place, x: position.x, y: position.y };
                }
                return place;
              });

              // Update transition positions
              newSDCPN.transitions = newSDCPN.transitions.map((transition) => {
                const position = positions.find(
                  (pos) => pos.id === transition.id
                );
                if (position) {
                  return { ...transition, x: position.x, y: position.y };
                }
                return transition;
              });

              return { sdcpn: newSDCPN };
            },
            false,
            "layoutGraph"
          );
        },
      }),
      { name: "SDCPN Store" }

    )
  );
}
