import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

export type EditorState = {
  // Selection - now just a Set of IDs
  selectedItemIds: Set<string>;
  setSelectedItemIds: (ids: Set<string>) => void;
  addSelectedItemId: (id: string) => void;
  removeSelectedItemId: (id: string) => void;
  clearSelection: () => void;

  // Dragging state
  draggingStateByNodeId: DraggingStateByNodeId;
  setDraggingStateByNodeId: (state: DraggingStateByNodeId) => void;
  updateDraggingStateByNodeId: (
    updater: (state: DraggingStateByNodeId) => DraggingStateByNodeId,
  ) => void;
  resetDraggingState: () => void;
};

/**
 * Creates a Zustand store for managing the UI state of the Petrinaut editor.
 * This includes selection state and dragging state.
 */
export function createEditorStore() {
  return create<EditorState>()(
    devtools(
      (set) => ({
        // Selection
        selectedItemIds: new Set(),
        setSelectedItemIds: (ids) =>
          set({ selectedItemIds: ids }, false, "setSelectedItemIds"),
        addSelectedItemId: (id) =>
          set(
            (state) => {
              const newSet = new Set(state.selectedItemIds);
              newSet.add(id);
              return { selectedItemIds: newSet };
            },
            false,
            "addSelectedItemId",
          ),
        removeSelectedItemId: (id) =>
          set(
            (state) => {
              const newSet = new Set(state.selectedItemIds);
              newSet.delete(id);
              return { selectedItemIds: newSet };
            },
            false,
            "removeSelectedItemId",
          ),
        clearSelection: () =>
          set({ selectedItemIds: new Set() }, false, "clearSelection"),

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
      }),
      { name: "Editor Store" },
    ),
  );
}
