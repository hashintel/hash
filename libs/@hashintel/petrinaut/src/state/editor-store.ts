import { create } from "zustand";
import { devtools } from "zustand/middleware";

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

  // Properties panel width (for DiagnosticsPanel positioning)
  propertiesPanelWidth: number;
  setPropertiesPanelWidth: (width: number) => void;

  // Diagnostics panel visibility and height
  isDiagnosticsPanelOpen: boolean;
  setDiagnosticsPanelOpen: (isOpen: boolean) => void;
  toggleDiagnosticsPanel: () => void;
  diagnosticsPanelHeight: number;
  setDiagnosticsPanelHeight: (height: number) => void;

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

          // Properties panel width
          propertiesPanelWidth: 450,
          setPropertiesPanelWidth: (width) =>
            set({ propertiesPanelWidth: width }, false, {
              type: "setPropertiesPanelWidth",
              width,
            }),

          // Diagnostics panel visibility and height
          isDiagnosticsPanelOpen: false,
          setDiagnosticsPanelOpen: (isOpen) =>
            set({ isDiagnosticsPanelOpen: isOpen }, false, {
              type: "setDiagnosticsPanelOpen",
              isOpen,
            }),
          toggleDiagnosticsPanel: () =>
            set(
              (state) => ({
                isDiagnosticsPanelOpen: !state.isDiagnosticsPanelOpen,
              }),
              false,
              "toggleDiagnosticsPanel",
            ),
          diagnosticsPanelHeight: 180,
          setDiagnosticsPanelHeight: (height) =>
            set({ diagnosticsPanelHeight: height }, false, {
              type: "setDiagnosticsPanelHeight",
              height,
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
                propertiesPanelWidth: 450,
                isDiagnosticsPanelOpen: false,
                diagnosticsPanelHeight: 180,
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
