import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

export type SelectionItem = {
  type: "place"
  id: string;
} | {
  type: "transition"
  id: string;
} | {
  type: "arc"
  placeId: string;
  transitionId: string;
  arcType: "input" | "output";
}

export type EditorState = {
  // Selection
  selectedItems: SelectionItem[];
  setSelectedItems: (items: SelectionItem[]) => void;
  addSelectedItem: (item: SelectionItem) => void;
  removeSelectedItem: (item: SelectionItem) => void;
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
        selectedItems: [],
        setSelectedItems: (items) =>
          set({ selectedItems: items }, false, "setSelectedItems"),
        addSelectedItem: (item) =>
          set(
            (state) => ({
              selectedItems: [...state.selectedItems, item],
            }),
            false,
            "addSelectedItem",
          ),
        removeSelectedItem: (item) =>
          set(
            (state) => ({
              selectedItems: state.selectedItems.filter((i) => {
                if (item.type === "place" && i.type === "place") {
                  return i.id !== item.id;
                }
                if (item.type === "transition" && i.type === "transition") {
                  return i.id !== item.id;
                }
                if (item.type === "arc" && i.type === "arc") {
                  return (
                    i.placeId !== item.placeId ||
                    i.transitionId !== item.transitionId ||
                    i.arcType !== item.arcType
                  );
                }
                return true;
              }),
            }),
            false,
            "removeSelectedItem",
          ),
        clearSelection: () =>
          set({ selectedItems: [] }, false, "clearSelection"),

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
