import type { ReactFlowInstance } from "reactflow";
import { create } from "zustand";

import type { Place, SDCPN, Transition } from "../../core/types/sdcpn";
import type { ArcData, NodeData } from "../types";

type SDCPNState = {
  // The current SDCPN definition
  sdcpn: SDCPN | null;
  setSDCPN: (sdcpn: SDCPN | null) => void;

  // Mutation helper for updating SDCPN
  mutateSDCPN: (mutationFn: (sdcpn: SDCPN) => void) => void;

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
export const useSDCPNStore = create<SDCPNState>((set) => ({
  sdcpn: null,
  setSDCPN: (sdcpn) => set({ sdcpn }),
  mutateSDCPN: (mutationFn) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      // Create a deep copy to avoid mutating the original
      const newSDCPN = JSON.parse(JSON.stringify(state.sdcpn)) as SDCPN;
      mutationFn(newSDCPN);

      return { sdcpn: newSDCPN };
    }),

  // Place operations
  updatePlace: (placeId, updates) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      const newSDCPN = { ...state.sdcpn };
      newSDCPN.places = newSDCPN.places.map((place) =>
        place.id === placeId ? { ...place, ...updates } : place,
      );

      return { sdcpn: newSDCPN };
    }),

  updatePlacePosition: (placeId, x, y) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      const newSDCPN = { ...state.sdcpn };
      newSDCPN.places = newSDCPN.places.map((place) =>
        place.id === placeId ? { ...place, x, y } : place,
      );

      return { sdcpn: newSDCPN };
    }),

  addPlace: (place) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      const newSDCPN = { ...state.sdcpn };
      newSDCPN.places = [...newSDCPN.places, place];

      return { sdcpn: newSDCPN };
    }),

  removePlace: (placeId) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      const newSDCPN = { ...state.sdcpn };
      newSDCPN.places = newSDCPN.places.filter((place) => place.id !== placeId);

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
    }),

  // Transition operations
  updateTransition: (transitionId, updates) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      const newSDCPN = { ...state.sdcpn };
      newSDCPN.transitions = newSDCPN.transitions.map((transition) =>
        transition.id === transitionId
          ? { ...transition, ...updates }
          : transition,
      );

      return { sdcpn: newSDCPN };
    }),

  updateTransitionPosition: (transitionId, x, y) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      const newSDCPN = { ...state.sdcpn };
      newSDCPN.transitions = newSDCPN.transitions.map((transition) =>
        transition.id === transitionId ? { ...transition, x, y } : transition,
      );

      return { sdcpn: newSDCPN };
    }),

  addTransition: (transition) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      const newSDCPN = { ...state.sdcpn };
      newSDCPN.transitions = [...newSDCPN.transitions, transition];

      return { sdcpn: newSDCPN };
    }),

  removeTransition: (transitionId) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      const newSDCPN = { ...state.sdcpn };
      newSDCPN.transitions = newSDCPN.transitions.filter(
        (transition) => transition.id !== transitionId,
      );

      return { sdcpn: newSDCPN };
    }),

  // Arc operations
  addArc: (transitionId, arcType, placeId, weight) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

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
    }),

  removeArc: (transitionId, arcType, placeId) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

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
    }),

  updateArcWeight: (transitionId, arcType, placeId, weight) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

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
    }),

  updateTitle: (title) =>
    set((state) => {
      if (!state.sdcpn) {
        return state;
      }

      return { sdcpn: { ...state.sdcpn, title } };
    }),

  // ReactFlow instance
  reactFlowInstance: null,
  setReactFlowInstance: (instance) => set({ reactFlowInstance: instance }),
}));
