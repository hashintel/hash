import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type {
  DifferentialEquation,
  Parameter,
  Place,
  SDCPN,
  SDCPNType,
  Transition,
} from "../core/types/sdcpn";
import { calculateGraphLayout } from "../lib/calculate-graph-layout";

const emptySDCPN: SDCPN = {
  id: "empty",
  title: "Untitled",
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
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
    updates: Partial<Transition>,
  ) => void;
  updateTransitionPosition: (
    transitionId: string,
    x: number,
    y: number,
  ) => void;
  addTransition: (transition: Transition) => void;
  removeTransition: (transitionId: string) => void;

  addArc: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
  removeArc: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
  ) => void;
  updateArcWeight: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;

  updateTitle: (title: string) => void;

  // Type operations
  addType: (type: SDCPNType) => void;
  updateType: (typeId: string, updates: Partial<SDCPNType>) => void;
  removeType: (typeId: string) => void;

  // Differential Equation operations
  addDifferentialEquation: (equation: DifferentialEquation) => void;
  updateDifferentialEquation: (
    equationId: string,
    updates: Partial<DifferentialEquation>,
  ) => void;
  removeDifferentialEquation: (equationId: string) => void;

  // Parameter operations
  addParameter: (parameter: Parameter) => void;
  updateParameter: (parameterId: string, updates: Partial<Parameter>) => void;
  removeParameter: (parameterId: string) => void;

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
                place.id === placeId ? { ...place, ...updates } : place,
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "updatePlace",
          ),

        updatePlacePosition: (placeId, x, y) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.places = newSDCPN.places.map((place) =>
                place.id === placeId ? { ...place, x, y } : place,
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "updatePlacePosition",
          ),

        addPlace: (place) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.places = [...newSDCPN.places, place];

              return { sdcpn: newSDCPN };
            },
            false,
            "addPlace",
          ),

        removePlace: (placeId) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.places = newSDCPN.places.filter(
                (place) => place.id !== placeId,
              );

              // Remove arcs connected to this place
              newSDCPN.transitions = newSDCPN.transitions.map((transition) => ({
                ...transition,
                inputArcs: transition.inputArcs.filter(
                  (arc) => arc.placeId !== placeId,
                ),
                outputArcs: transition.outputArcs.filter(
                  (arc) => arc.placeId !== placeId,
                ),
              }));

              return { sdcpn: newSDCPN };
            },
            false,
            "removePlace",
          ),

        // Transition operations
        updateTransition: (transitionId, updates) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.map((transition) =>
                transition.id === transitionId
                  ? { ...transition, ...updates }
                  : transition,
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "updateTransition",
          ),

        updateTransitionPosition: (transitionId, x, y) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.map((transition) =>
                transition.id === transitionId
                  ? { ...transition, x, y }
                  : transition,
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "updateTransitionPosition",
          ),

        addTransition: (transition) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = [...newSDCPN.transitions, transition];

              return { sdcpn: newSDCPN };
            },
            false,
            "addTransition",
          ),

        removeTransition: (transitionId) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.transitions = newSDCPN.transitions.filter(
                (transition) => transition.id !== transitionId,
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "removeTransition",
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
            "addArc",
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
                      (arc) => arc.placeId !== placeId,
                    ),
                  };
                }
                return {
                  ...transition,
                  outputArcs: transition.outputArcs.filter(
                    (arc) => arc.placeId !== placeId,
                  ),
                };
              });

              return { sdcpn: newSDCPN };
            },
            false,
            "removeArc",
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
                      arc.placeId === placeId ? { ...arc, weight } : arc,
                    ),
                  };
                }
                return {
                  ...transition,
                  outputArcs: transition.outputArcs.map((arc) =>
                    arc.placeId === placeId ? { ...arc, weight } : arc,
                  ),
                };
              });

              return { sdcpn: newSDCPN };
            },
            false,
            "updateArcWeight",
          ),

        updateTitle: (title) =>
          set(
            (state) => {
              return { sdcpn: { ...state.sdcpn, title } };
            },
            false,
            "updateTitle",
          ),

        // Type operations
        addType: (type) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.types = [...newSDCPN.types, type];
              return { sdcpn: newSDCPN };
            },
            false,
            "addType",
          ),

        updateType: (typeId, updates) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.types = newSDCPN.types.map((type) =>
                type.id === typeId ? { ...type, ...updates } : type,
              );
              return { sdcpn: newSDCPN };
            },
            false,
            "updateType",
          ),

        removeType: (typeId) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };

              // Remove the type
              newSDCPN.types = newSDCPN.types.filter(
                (type) => type.id !== typeId,
              );

              // Set type to null for all places that were using this type
              newSDCPN.places = newSDCPN.places.map((place) =>
                place.type === typeId ? { ...place, type: null } : place,
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "removeType",
          ),

        // Differential Equation operations
        addDifferentialEquation: (equation) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.differentialEquations = [
                ...newSDCPN.differentialEquations,
                equation,
              ];
              return { sdcpn: newSDCPN };
            },
            false,
            "addDifferentialEquation",
          ),

        updateDifferentialEquation: (equationId, updates) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.differentialEquations =
                newSDCPN.differentialEquations.map((eq) =>
                  eq.id === equationId ? { ...eq, ...updates } : eq,
                );
              return { sdcpn: newSDCPN };
            },
            false,
            "updateDifferentialEquation",
          ),

        removeDifferentialEquation: (equationId) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };

              // Remove the differential equation
              newSDCPN.differentialEquations =
                newSDCPN.differentialEquations.filter(
                  (eq) => eq.id !== equationId,
                );

              // Set differentialEquationCode to null for places that were using this equation
              newSDCPN.places = newSDCPN.places.map((place) => {
                if (
                  place.differentialEquationCode &&
                  typeof place.differentialEquationCode === "object" &&
                  "refId" in place.differentialEquationCode &&
                  place.differentialEquationCode.refId === equationId
                ) {
                  return { ...place, differentialEquationCode: null };
                }
                return place;
              });

              return { sdcpn: newSDCPN };
            },
            false,
            "removeDifferentialEquation",
          ),

        // Parameter operations
        addParameter: (parameter) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.parameters = [...newSDCPN.parameters, parameter];
              return { sdcpn: newSDCPN };
            },
            false,
            "addParameter",
          ),

        updateParameter: (parameterId, updates) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };
              newSDCPN.parameters = newSDCPN.parameters.map((param) =>
                param.id === parameterId ? { ...param, ...updates } : param,
              );
              return { sdcpn: newSDCPN };
            },
            false,
            "updateParameter",
          ),

        removeParameter: (parameterId) =>
          set(
            (state) => {
              const newSDCPN = { ...state.sdcpn };

              // Remove the parameter
              newSDCPN.parameters = newSDCPN.parameters.filter(
                (param) => param.id !== parameterId,
              );

              return { sdcpn: newSDCPN };
            },
            false,
            "removeParameter",
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
                  // Arc ID format: $A_<sourceId>___<targetId> (triple underscore separator)
                  const withoutPrefix = id.slice(3); // Remove "$A_"
                  const parts = withoutPrefix.split("___");

                  if (parts.length !== 2) {
                    continue;
                  }

                  const inputId = parts[0];
                  const outputId = parts[1];

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
                newSDCPN.transitions = newSDCPN.transitions.map(
                  (transition) => ({
                    ...transition,
                    inputArcs: transition.inputArcs.filter(
                      (arc) => !placeIdsToDelete.has(arc.placeId),
                    ),
                    outputArcs: transition.outputArcs.filter(
                      (arc) => !placeIdsToDelete.has(arc.placeId),
                    ),
                  }),
                );
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
                  (pos) => pos.id === transition.id,
                );
                if (position) {
                  return { ...transition, x: position.x, y: position.y };
                }
                return transition;
              });

              return { sdcpn: newSDCPN };
            },
            false,
            "layoutGraph",
          );
        },
      }),
      { name: "SDCPN Store" },
    ),
  );
}
