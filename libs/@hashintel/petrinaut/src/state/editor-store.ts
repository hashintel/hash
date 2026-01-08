import { create } from "zustand";
import { devtools } from "zustand/middleware";

import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "../constants/ui";

export type DraggingStateByNodeId = Record<
  string,
  { dragging: boolean; position: { x: number; y: number } }
>;

type EditorGlobalMode = "edit" | "simulate";
type EditorEditionMode = "select" | "pan" | "add-place" | "add-transition";
export type BottomPanelTab = "diagnostics" | "simulation-settings";

export type EditorState = {
  globalMode: EditorGlobalMode;
  setGlobalMode: (mode: EditorGlobalMode) => void;

  editionMode: EditorEditionMode;
  setEditionMode: (mode: EditorEditionMode) => void;

  // UI state
  isLeftSidebarOpen: boolean;
  setLeftSidebarOpen: (isOpen: boolean) => void;
  leftSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;

  // Properties panel width (for BottomPanel positioning)
  propertiesPanelWidth: number;
  setPropertiesPanelWidth: (width: number) => void;

  // Bottom panel visibility, height, and active tab
  isBottomPanelOpen: boolean;
  setBottomPanelOpen: (isOpen: boolean) => void;
  toggleBottomPanel: () => void;
  bottomPanelHeight: number;
  setBottomPanelHeight: (height: number) => void;
  activeBottomPanelTab: BottomPanelTab;
  setActiveBottomPanelTab: (tab: BottomPanelTab) => void;

  // Selected Resource ID (for properties panel)
  selectedResourceId: string | null;
  setSelectedResourceId: (id: string | null) => void;

  // Selection state (for ReactFlow selection)
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

  __reinitialize: () => void;
};

/**
 * Creates a Zustand store for managing the UI state of the Petrinaut editor.
 * This includes selection state and dragging state.
 */
export function createEditorStore() {
  return create<EditorState>()(
    devtools(
      (set) =>
        ({
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
          leftSidebarWidth: DEFAULT_LEFT_SIDEBAR_WIDTH,
          setLeftSidebarWidth: (width) =>
            set({ leftSidebarWidth: width }, false, {
              type: "setLeftSidebarWidth",
              width,
            }),

          // Properties panel width
          propertiesPanelWidth: DEFAULT_PROPERTIES_PANEL_WIDTH,
          setPropertiesPanelWidth: (width) =>
            set({ propertiesPanelWidth: width }, false, {
              type: "setPropertiesPanelWidth",
              width,
            }),

          // Bottom panel visibility and height
          isBottomPanelOpen: false,
          setBottomPanelOpen: (isOpen) =>
            set({ isBottomPanelOpen: isOpen }, false, {
              type: "setBottomPanelOpen",
              isOpen,
            }),
          toggleBottomPanel: () =>
            set(
              (state) => ({
                isBottomPanelOpen: !state.isBottomPanelOpen,
              }),
              false,
              "toggleBottomPanel",
            ),
          bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,
          setBottomPanelHeight: (height) =>
            set({ bottomPanelHeight: height }, false, {
              type: "setBottomPanelHeight",
              height,
            }),
          activeBottomPanelTab: "diagnostics",
          setActiveBottomPanelTab: (tab) =>
            set({ activeBottomPanelTab: tab }, false, {
              type: "setActiveBottomPanelTab",
              tab,
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
                leftSidebarWidth: DEFAULT_LEFT_SIDEBAR_WIDTH,
                propertiesPanelWidth: DEFAULT_PROPERTIES_PANEL_WIDTH,
                isBottomPanelOpen: false,
                bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,
                activeBottomPanelTab: "diagnostics",
                selectedResourceId: null,
                selectedItemIds: new Set(),
                draggingStateByNodeId: {},
              },
              false,
              { type: "initializeEditorStore" },
            );
          },
          // for some reason 'create' doesn't raise an error if a function in the type is missing
        }) satisfies EditorState,
      { name: "Editor Store" },
    ),
  );
}
