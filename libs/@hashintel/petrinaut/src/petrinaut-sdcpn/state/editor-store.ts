import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type { SDCPNState } from "./sdcpn-store";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

type EditorGlobalMode = "edit" | "simulate";
type EditorEditionMode = "select" | "pan" | "add-place" | "add-transition";

export type EditorState = {
  globalMode: EditorGlobalMode;
  setGlobalMode: (mode: EditorGlobalMode) => void;

  editionMode: EditorEditionMode;
  setEditionMode: (mode: EditorEditionMode) => void;

  // UI state
  isLeftSidebarOpen: boolean;
  setLeftSidebarOpen: (isOpen: boolean) => void;

  // Selected Resource ID (for properties panel)
  selectedResourceId: string | null;
  setSelectedResourceId: (id: string | null) => void;

  // Selection state (for ReactFlow selection)
  selectedItemIds: Set<string>;
  setSelectedItemIds: (ids: Set<string>) => void;
  addSelectedItemId: (id: string) => void;
  removeSelectedItemId: (id: string) => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  getItemType: (
    id: string,
  ) =>
    | "place"
    | "transition"
    | "arc"
    | "type"
    | "differentialEquation"
    | "parameter"
    | null;

  // Dragging state
  draggingStateByNodeId: DraggingStateByNodeId;
  setDraggingStateByNodeId: (state: DraggingStateByNodeId) => void;
  updateDraggingStateByNodeId: (
    updater: (state: DraggingStateByNodeId) => DraggingStateByNodeId,
  ) => void;
  resetDraggingState: () => void;

  __reinitialize: () => void;
};

/**
 * Creates a Zustand store for managing the UI state of the Petrinaut editor.
 * This includes selection state and dragging state.
 */
export function createEditorStore(sdcpnStore: {
  getState: () => SDCPNState;
}) {
  return create<EditorState>()(
    devtools(
      (set) => ({
        globalMode: "edit",
        setGlobalMode: (mode) =>
          set({ globalMode: mode }, false, { type: "setGlobalMode", mode }),

        editionMode: "select",
        setEditionMode: (mode) =>
          set({ editionMode: mode }, false, { type: "setEditionMode", mode }),

        // UI state
        isLeftSidebarOpen: true,
        setLeftSidebarOpen: (isOpen) =>
          set({ isLeftSidebarOpen: isOpen }, false, {
            type: "setLeftSidebarOpen",
            isOpen,
          }),

        // Selected Resource ID
        selectedResourceId: null,
        setSelectedResourceId: (id) =>
          set({ selectedResourceId: id }, false, {
            type: "setSelectedResourceId",
            id,
          }),

        // Selection
        selectedItemIds: new Set(),
        setSelectedItemIds: (ids) =>
          set({ selectedItemIds: ids }, false, {
            type: "setSelectedItemIds",
            ids,
          }),
        addSelectedItemId: (id) =>
          set(
            (state) => {
              const newSet = new Set(state.selectedItemIds);
              newSet.add(id);
              return { selectedItemIds: newSet };
            },
            false,
            { type: "addSelectedItemId", id },
          ),
        removeSelectedItemId: (id) =>
          set(
            (state) => {
              const newSet = new Set(state.selectedItemIds);
              newSet.delete(id);
              return { selectedItemIds: newSet };
            },
            false,
            { type: "removeSelectedItemId", id },
          ),
        clearSelection: () =>
          set({ selectedItemIds: new Set() }, false, "clearSelection"),
        deleteSelection: () =>
          set(
            (state) => {
              const { deleteItemsByIds } = sdcpnStore.getState();

              // Call the SDCPN store's delete method with all selected IDs
              deleteItemsByIds(state.selectedItemIds);

              return { selectedItemIds: new Set() };
            },
            false,
            "deleteSelection",
          ),
        // Get the type of an item by its ID
        // TODO: Should be in SDCPN store?
        getItemType: (id) => {
          const sdcpn = sdcpnStore.getState().sdcpn;

          // Check for arc (starts with $A_)
          if (id.startsWith("$A_")) {
            return "arc";
          }

          // Check places
          if (sdcpn.places.some((place) => place.id === id)) {
            return "place";
          }

          // Check transitions
          if (sdcpn.transitions.some((transition) => transition.id === id)) {
            return "transition";
          }

          // Check types
          if (sdcpn.types.some((type) => type.id === id)) {
            return "type";
          }

          // Check differential equations
          if (
            sdcpn.differentialEquations.some((equation) => equation.id === id)
          ) {
            return "differentialEquation";
          }

          // Check parameters
          if (sdcpn.parameters.some((parameter) => parameter.id === id)) {
            return "parameter";
          }

          return null;
        },

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

        __reinitialize: () => {
          set(
            {
              globalMode: "edit",
              editionMode: "select",
              isLeftSidebarOpen: true,
              selectedResourceId: null,
              selectedItemIds: new Set(),
              draggingStateByNodeId: {},
            },
            false,
            { type: "initializeEditorStore" },
          );
        },
      }),
      { name: "Editor Store" },
    ),
  );
}
