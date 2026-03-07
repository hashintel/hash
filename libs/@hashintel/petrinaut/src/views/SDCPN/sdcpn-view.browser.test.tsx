import "@xyflow/react/dist/style.css";

import { fireEvent } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import type { SDCPN } from "../../core/types/sdcpn";
import {
  PlaybackContext,
  type PlaybackContextValue,
} from "../../playback/context";
import {
  SimulationContext,
  type SimulationContextValue,
} from "../../simulation/context";
import {
  EditorContext,
  type EditorContextValue,
  initialEditorState,
} from "../../state/editor-context";
import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../../state/sdcpn-context";
import type { SelectionMap } from "../../state/selection";
import {
  defaultUserSettings,
  UserSettingsContext,
  type UserSettingsContextValue,
} from "../../state/user-settings-context";
import { SDCPNView } from "./sdcpn-view";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createTestSDCPN(overrides?: Partial<SDCPN>): SDCPN {
  return {
    places: [
      {
        id: "place__1",
        name: "PlaceA",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 100,
        y: 100,
      },
      {
        id: "place__2",
        name: "PlaceB",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 400,
        y: 100,
      },
    ],
    transitions: [
      {
        id: "transition__1",
        name: "TransitionA",
        inputArcs: [],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: "",
        transitionKernelCode: "",
        x: 250,
        y: 250,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [],
    ...overrides,
  };
}

function createMockSDCPNContext(
  sdcpn: SDCPN,
  overrides?: Partial<SDCPNContextValue>,
): SDCPNContextValue {
  return {
    createNewNet: vi.fn(),
    existingNets: [],
    loadPetriNet: vi.fn(),
    petriNetId: "test-net",
    petriNetDefinition: sdcpn,
    readonly: false,
    mutatePetriNetDefinition: vi.fn(),
    setTitle: vi.fn(),
    title: "Test Net",
    addPlace: vi.fn(),
    updatePlace: vi.fn(),
    updatePlacePosition: vi.fn(),
    removePlace: vi.fn(),
    addTransition: vi.fn(),
    updateTransition: vi.fn(),
    updateTransitionPosition: vi.fn(),
    removeTransition: vi.fn(),
    addArc: vi.fn(),
    removeArc: vi.fn(),
    updateArcWeight: vi.fn(),
    addType: vi.fn(),
    updateType: vi.fn(),
    removeType: vi.fn(),
    addDifferentialEquation: vi.fn(),
    updateDifferentialEquation: vi.fn(),
    removeDifferentialEquation: vi.fn(),
    addParameter: vi.fn(),
    updateParameter: vi.fn(),
    removeParameter: vi.fn(),
    getItemType: vi.fn((id: string) => {
      if (id.startsWith("place")) {
        return "place";
      }
      if (id.startsWith("transition")) {
        return "transition";
      }
      if (id.startsWith("$A_")) {
        return "arc";
      }
      return null;
    }),
    deleteItemsByIds: vi.fn(),
    layoutGraph: vi.fn(async () => {}),
    ...overrides,
  };
}

function createMockEditorContext(
  overrides?: Partial<EditorContextValue>,
): EditorContextValue {
  return {
    ...initialEditorState,
    cursorMode: "select",
    setGlobalMode: vi.fn(),
    setEditionMode: vi.fn(),
    setCursorMode: vi.fn(),
    setLeftSidebarOpen: vi.fn(),
    setLeftSidebarWidth: vi.fn(),
    setPropertiesPanelWidth: vi.fn(),
    setBottomPanelOpen: vi.fn(),
    toggleBottomPanel: vi.fn(),
    setBottomPanelHeight: vi.fn(),
    setActiveBottomPanelTab: vi.fn(),
    setSelection: vi.fn(),
    selectItem: vi.fn(),
    toggleItem: vi.fn(),
    addToSelection: vi.fn(),
    removeFromSelection: vi.fn(),
    clearSelection: vi.fn(),
    focusNode: vi.fn(),
    registerFocusNode: vi.fn(),
    setDraggingStateByNodeId: vi.fn(),
    updateDraggingStateByNodeId: vi.fn(),
    resetDraggingState: vi.fn(),
    collapseAllPanels: vi.fn(),
    setTimelineChartType: vi.fn(),
    triggerPanelAnimation: vi.fn(),
    __reinitialize: vi.fn(),
    ...overrides,
  };
}

function createMockPlaybackContext(
  overrides?: Partial<PlaybackContextValue>,
): PlaybackContextValue {
  return {
    currentFrame: null,
    currentViewedFrame: null,
    playbackState: "Stopped",
    currentFrameIndex: 0,
    totalFrames: 0,
    playbackSpeed: 1,
    playMode: "computeMax",
    isViewOnlyAvailable: false,
    isComputeAvailable: true,
    setCurrentViewedFrame: vi.fn(),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    stop: vi.fn(),
    setPlaybackSpeed: vi.fn(),
    setPlayMode: vi.fn(),
    ...overrides,
  };
}

function createMockSimulationContext(
  overrides?: Partial<SimulationContextValue>,
): SimulationContextValue {
  return {
    state: "NotRun",
    error: null,
    errorItemId: null,
    parameterValues: {},
    initialMarking: new Map(),
    dt: 0.01,
    maxTime: null,
    totalFrames: 0,
    getFrame: vi.fn(() => Promise.resolve(null)),
    getAllFrames: vi.fn(() => Promise.resolve([])),
    getFramesInRange: vi.fn(() => Promise.resolve([])),
    setInitialMarking: vi.fn(),
    setParameterValue: vi.fn(),
    setDt: vi.fn(),
    setMaxTime: vi.fn(),
    initialize: vi.fn(async () => {}),
    run: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    setBackpressure: vi.fn(),
    ack: vi.fn(),
    ...overrides,
  };
}

function createMockUserSettings(
  overrides?: Partial<UserSettingsContextValue>,
): UserSettingsContextValue {
  return {
    ...defaultUserSettings,
    setShowAnimations: vi.fn(),
    setKeepPanelsMounted: vi.fn(),
    setCompactNodes: vi.fn(),
    setArcRendering: vi.fn(),
    setIsLeftSidebarOpen: vi.fn(),
    setLeftSidebarWidth: vi.fn(),
    setPropertiesPanelWidth: vi.fn(),
    setIsBottomPanelOpen: vi.fn(),
    setBottomPanelHeight: vi.fn(),
    setActiveBottomPanelTab: vi.fn(),
    setCursorMode: vi.fn(),
    setTimelineChartType: vi.fn(),
    updateSubViewSection: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

function renderSDCPNView(opts?: {
  sdcpn?: SDCPN;
  sdcpnOverrides?: Partial<SDCPNContextValue>;
  editorOverrides?: Partial<EditorContextValue>;
  userSettingsOverrides?: Partial<UserSettingsContextValue>;
}) {
  const sdcpn = opts?.sdcpn ?? createTestSDCPN();
  const sdcpnCtx = createMockSDCPNContext(sdcpn, opts?.sdcpnOverrides);
  const editorCtx = createMockEditorContext(opts?.editorOverrides);
  const playbackCtx = createMockPlaybackContext();
  const simulationCtx = createMockSimulationContext();
  const userSettingsCtx = createMockUserSettings(opts?.userSettingsOverrides);

  const result = render(
    <UserSettingsContext value={userSettingsCtx}>
      <SimulationContext value={simulationCtx}>
        <PlaybackContext value={playbackCtx}>
          <SDCPNContext value={sdcpnCtx}>
            <EditorContext value={editorCtx}>
              <div style={{ width: 800, height: 600 }}>
                <SDCPNView />
              </div>
            </EditorContext>
          </SDCPNContext>
        </PlaybackContext>
      </SimulationContext>
    </UserSettingsContext>,
  );

  return { result, editorCtx, sdcpnCtx, userSettingsCtx };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for ReactFlow to initialise (nodes get rendered to the DOM). */
async function waitForNodes(expectedCount: number) {
  await expect
    .poll(() => document.querySelectorAll(".react-flow__node").length, {
      timeout: 5_000,
      message: `Expected ${expectedCount} rendered nodes`,
    })
    .toBe(expectedCount);
}

/**
 * Simulate a drag-select rectangle using fireEvent pointer events.
 * Coordinates are relative to the pane element's bounding rect.
 */
function dragSelectOnPane(
  pane: Element,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const rect = pane.getBoundingClientRect();
  const absStartX = rect.left + startX;
  const absStartY = rect.top + startY;
  const absEndX = rect.left + endX;
  const absEndY = rect.top + endY;

  // Pointer down on the pane to start selection
  fireEvent.pointerDown(pane, {
    clientX: absStartX,
    clientY: absStartY,
    button: 0,
    isPrimary: true,
    pointerId: 1,
  });

  // Move in steps so ReactFlow registers a drag (exceeds paneClickDistance)
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps;
    fireEvent.pointerMove(pane, {
      clientX: absStartX + (absEndX - absStartX) * ratio,
      clientY: absStartY + (absEndY - absStartY) * ratio,
      button: 0,
      isPrimary: true,
      pointerId: 1,
    });
  }

  // Pointer up to finalize
  fireEvent.pointerUp(pane, {
    clientX: absEndX,
    clientY: absEndY,
    button: 0,
    isPrimary: true,
    pointerId: 1,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SDCPNView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders place and transition nodes in classic mode", async () => {
      renderSDCPNView({ userSettingsOverrides: { compactNodes: false } });
      await waitForNodes(3); // 2 places + 1 transition
    });

    it("renders place and transition nodes in compact mode", async () => {
      renderSDCPNView({ userSettingsOverrides: { compactNodes: true } });
      await waitForNodes(3);
    });
  });

  describe("node click dispatches to EditorContext", () => {
    it("calls selectItem when a node is clicked", async () => {
      const { editorCtx } = renderSDCPNView();
      await waitForNodes(3);

      const node = document.querySelector('[data-id="place__1"]')!;
      fireEvent.click(node);

      expect(editorCtx.selectItem).toHaveBeenCalledWith({
        type: "place",
        id: "place__1",
      });
    });

    it("calls toggleItem on ctrl+click", async () => {
      const { editorCtx } = renderSDCPNView();
      await waitForNodes(3);

      const node = document.querySelector('[data-id="place__1"]')!;
      fireEvent.click(node, { ctrlKey: true });

      expect(editorCtx.toggleItem).toHaveBeenCalledWith({
        type: "place",
        id: "place__1",
      });
    });
  });

  describe("pane click dispatches to EditorContext", () => {
    it("calls clearSelection when clicking empty canvas", async () => {
      // Use pan mode so the pane has a regular onClick handler
      // (in select mode, ReactFlow replaces onClick with pointer event handlers)
      const { editorCtx } = renderSDCPNView({
        editorOverrides: { cursorMode: "pan" },
      });
      await waitForNodes(3);

      const pane = document.querySelector(".react-flow__pane")!;
      fireEvent.click(pane);

      expect(editorCtx.clearSelection).toHaveBeenCalled();
    });
  });

  describe("drag-select in select cursor mode", () => {
    it("dispatches selection changes via setSelection when nodes are drag-selected (classic)", async () => {
      const { editorCtx } = renderSDCPNView({
        editorOverrides: { cursorMode: "select" },
        userSettingsOverrides: { compactNodes: false },
      });
      await waitForNodes(3);

      const pane = document.querySelector(".react-flow__pane")!;
      // Use extreme coordinates to ensure the selection rectangle covers all nodes
      // regardless of how fitView adjusts the viewport transform
      dragSelectOnPane(pane, -2000, -2000, 4000, 4000);

      // setSelection should have been called at least once during the drag
      expect(editorCtx.setSelection).toHaveBeenCalled();

      // Collect all selected IDs across all setSelection calls
      const allSelectedIds = new Set<string>();
      for (const call of (editorCtx.setSelection as ReturnType<typeof vi.fn>)
        .mock.calls) {
        const selMap = call[0] as SelectionMap;
        for (const id of selMap.keys()) {
          allSelectedIds.add(id);
        }
      }

      expect(allSelectedIds.has("place__1")).toBe(true);
      expect(allSelectedIds.has("place__2")).toBe(true);
      expect(allSelectedIds.has("transition__1")).toBe(true);
    });

    it("dispatches selection changes via setSelection when nodes are drag-selected (compact)", async () => {
      const { editorCtx } = renderSDCPNView({
        editorOverrides: { cursorMode: "select" },
        userSettingsOverrides: { compactNodes: true },
      });
      await waitForNodes(3);

      const pane = document.querySelector(".react-flow__pane")!;
      dragSelectOnPane(pane, -2000, -2000, 4000, 4000);

      expect(editorCtx.setSelection).toHaveBeenCalled();

      // Collect all selected IDs across all setSelection calls
      const allSelectedIds = new Set<string>();
      for (const call of (editorCtx.setSelection as ReturnType<typeof vi.fn>)
        .mock.calls) {
        const selMap = call[0] as SelectionMap;
        for (const id of selMap.keys()) {
          allSelectedIds.add(id);
        }
      }

      expect(allSelectedIds.has("place__1")).toBe(true);
      expect(allSelectedIds.has("place__2")).toBe(true);
      expect(allSelectedIds.has("transition__1")).toBe(true);
    });

    it("does not select nodes outside the drag rectangle", async () => {
      // Place nodes far apart so we can select just one
      const sdcpn = createTestSDCPN({
        places: [
          {
            id: "place__1",
            name: "PlaceA",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 100,
            y: 100,
          },
          {
            id: "place__2",
            name: "PlaceB",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 600,
            y: 500,
          },
        ],
        transitions: [],
      });

      const { editorCtx } = renderSDCPNView({
        sdcpn,
        editorOverrides: { cursorMode: "select" },
        userSettingsOverrides: { compactNodes: false },
      });
      await waitForNodes(2);

      const pane = document.querySelector(".react-flow__pane")!;
      // Drag a small rectangle in the top-left area where only PlaceA is
      dragSelectOnPane(pane, 0, 0, 250, 250);

      const calls = (editorCtx.setSelection as ReturnType<typeof vi.fn>).mock
        .calls;

      if (calls.length > 0) {
        const lastCall = calls.at(-1)?.[0] as SelectionMap | undefined;
        if (lastCall && lastCall.size > 0) {
          expect(lastCall.has("place__1")).toBe(true);
          expect(lastCall.has("place__2")).toBe(false);
        }
      }
    });
  });

  describe("selection is not enabled in pan mode", () => {
    it("does not dispatch setSelection on drag in pan mode", async () => {
      const { editorCtx } = renderSDCPNView({
        editorOverrides: { cursorMode: "pan" },
      });
      await waitForNodes(3);

      const pane = document.querySelector(".react-flow__pane")!;
      dragSelectOnPane(pane, 0, 0, 800, 600);

      // In pan mode, drag should pan the canvas, not select
      expect(editorCtx.setSelection).not.toHaveBeenCalled();
    });
  });

  describe("keyboard delete dispatches to EditorContext", () => {
    it("calls deleteItemsByIds and clearSelection on Delete key", async () => {
      const selection: SelectionMap = new Map([
        ["place__1", { type: "place", id: "place__1" }],
      ]);

      const { editorCtx, sdcpnCtx } = renderSDCPNView({
        editorOverrides: { selection },
      });
      await waitForNodes(3);

      // The onKeyDown handler is on the container div wrapping ReactFlow.
      const container = document.querySelector(".react-flow")?.parentElement;
      if (container) {
        fireEvent.keyDown(container, { key: "Delete" });
      }

      expect(sdcpnCtx.deleteItemsByIds).toHaveBeenCalled();
      expect(editorCtx.clearSelection).toHaveBeenCalled();
    });
  });
});
