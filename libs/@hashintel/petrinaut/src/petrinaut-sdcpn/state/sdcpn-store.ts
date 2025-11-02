import type { ReactFlowInstance } from "reactflow";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type { Place, SDCPN, Transition } from "../../core/types/sdcpn";
import type { ArcData, NodeData, TokenType } from "../types";

const emptySDCPN: SDCPN = {
  id: "empty",
  title: "Untitled",
  places: [],
  transitions: [],
};

type SDCPNState = {
  // The current SDCPN definition - always exists, never null
  sdcpn: SDCPN;
  setSDCPN: (sdcpn: SDCPN) => void;

  // Token types - not part of SDCPN core type but needed for visualization
  tokenTypes: TokenType[];
  setTokenTypes: (tokenTypes: TokenType[]) => void;

  // Callback to load a different net by ID
  loadPetriNet: ((petriNetId: string) => void) | null;
  setLoadPetriNet: (
    loadPetriNet: ((petriNetId: string) => void) | null,
  ) => void;

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

  // ReactFlow instance - controls the visual representation
  reactFlowInstance: ReactFlowInstance<NodeData, ArcData> | null;
  setReactFlowInstance: (
    instance: ReactFlowInstance<NodeData, ArcData> | null,
  ) => void;
};

/**
 * Zustand store for managing the SDCPN definition and its visual representation.
 * This stores the core SDCPN model along with the ReactFlow instance that displays it.
 */
export const useSDCPNStore = create<SDCPNState>()(
  devtools(
    (set) => ({
      sdcpn: emptySDCPN,
      setSDCPN: (sdcpn) => set({ sdcpn }, false, "setSDCPN"),

      tokenTypes: [],
      setTokenTypes: (tokenTypes) =>
        set({ tokenTypes }, false, "setTokenTypes"),

      loadPetriNet: null,
      setLoadPetriNet: (loadPetriNet) =>
        set({ loadPetriNet }, false, "setLoadPetriNet"),

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

      // ReactFlow instance
      reactFlowInstance: null,
      setReactFlowInstance: (instance) =>
        set({ reactFlowInstance: instance }, false, "setReactFlowInstance"),
    }),
    { name: "SDCPN Store" },
  ),
);
