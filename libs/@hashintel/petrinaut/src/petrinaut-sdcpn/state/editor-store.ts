import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type { ArcType } from "./types-for-editor-to-remove";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

export type SelectedArc = ArcType & { position: { x: number; y: number } };

type EditorState = {
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
 * This includes selection state and dragging state.
 */
export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      // Place selection
      selectedPlaceId: null,
      setSelectedPlaceId: (id) =>
        set({ selectedPlaceId: id }, false, "setSelectedPlaceId"),
      selectedPlacePosition: null,
      setSelectedPlacePosition: (position) =>
        set(
          { selectedPlacePosition: position },
          false,
          "setSelectedPlacePosition",
        ),

      // Transition selection
      selectedTransition: null,
      setSelectedTransition: (id) =>
        set({ selectedTransition: id }, false, "setSelectedTransition"),

      // Arc selection
      selectedArc: null,
      setSelectedArc: (arc) =>
        set({ selectedArc: arc }, false, "setSelectedArc"),

      // Dragging state
      draggingStateByNodeId: {},
      setDraggingStateByNodeId: (state) =>
        set(
          { draggingStateByNodeId: state },
          false,
          "setDraggingStateByNodeId",
        ),
      updateDraggingStateByNodeId: (updater) =>
        set(
          (state) => ({
            draggingStateByNodeId: updater(state.draggingStateByNodeId),
          }),
          false,
          "updateDraggingStateByNodeId",
        ),
      resetDraggingState: () =>
        set({ draggingStateByNodeId: {} }, false, "resetDraggingState"),

      // Utility actions
      clearSelection: () =>
        set(
          {
            selectedPlaceId: null,
            selectedPlacePosition: null,
            selectedArc: null,
            selectedTransition: null,
          },
          false,
          "clearSelection",
        ),
    }),
    { name: "Editor Store" },
  ),
);
