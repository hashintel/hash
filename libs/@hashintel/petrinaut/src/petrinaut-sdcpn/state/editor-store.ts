import type { ReactFlowInstance } from "reactflow";
import { create } from "zustand";

import type { ArcData, ArcType, NodeData } from "../types";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

export type SelectedArc = ArcType & { position: { x: number; y: number } };

type EditorState = {
  // ReactFlow instance
  reactFlowInstance: ReactFlowInstance<NodeData, ArcData> | null;
  setReactFlowInstance: (
    instance: ReactFlowInstance<NodeData, ArcData> | null,
  ) => void;

  // Place selection
  selectedPlaceId: string | null;
  setSelectedPlaceId: (id: string | null) => void;
  selectedPlacePosition: { x: number; y: number } | null;
  setSelectedPlacePosition: (position: { x: number; y: number } | null) => void;

  // Transition selection
  selectedTransition: string | null;
  setSelectedTransition: (id: string | null) => void;

  // Arc selection
  selectedArc: SelectedArc | null;
  setSelectedArc: (arc: SelectedArc | null) => void;

  // Dragging state
  draggingStateByNodeId: DraggingStateByNodeId;
  setDraggingStateByNodeId: (state: DraggingStateByNodeId) => void;
  updateDraggingStateByNodeId: (
    updater: (state: DraggingStateByNodeId) => DraggingStateByNodeId,
  ) => void;
  resetDraggingState: () => void;

  // Utility actions
  clearSelection: () => void;
};

/**
 * Zustand store for managing the UI state of the Petrinaut editor.
 * This includes selection state, dragging state, and ReactFlow instance.
 */
export const useEditorStore = create<EditorState>((set) => ({
  // ReactFlow instance
  reactFlowInstance: null,
  setReactFlowInstance: (instance) => set({ reactFlowInstance: instance }),

  // Place selection
  selectedPlaceId: null,
  setSelectedPlaceId: (id) => set({ selectedPlaceId: id }),
  selectedPlacePosition: null,
  setSelectedPlacePosition: (position) =>
    set({ selectedPlacePosition: position }),

  // Transition selection
  selectedTransition: null,
  setSelectedTransition: (id) => set({ selectedTransition: id }),

  // Arc selection
  selectedArc: null,
  setSelectedArc: (arc) => set({ selectedArc: arc }),

  // Dragging state
  draggingStateByNodeId: {},
  setDraggingStateByNodeId: (state) => set({ draggingStateByNodeId: state }),
  updateDraggingStateByNodeId: (updater) =>
    set((state) => ({ draggingStateByNodeId: updater(state.draggingStateByNodeId) })),
  resetDraggingState: () => set({ draggingStateByNodeId: {} }),

  // Utility actions
  clearSelection: () =>
    set({
      selectedPlaceId: null,
      selectedPlacePosition: null,
      selectedArc: null,
      selectedTransition: null,
    }),
}));
