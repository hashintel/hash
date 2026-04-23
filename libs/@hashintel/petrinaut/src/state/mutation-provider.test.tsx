/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { type ReactNode, use } from "react";
import { describe, expect, test, vi } from "vitest";

import type { SDCPN } from "../core/types/sdcpn";
import {
  SimulationContext,
  type SimulationContextValue,
} from "../simulation/context";
import {
  EditorContext,
  type EditorContextValue,
  initialEditorState,
} from "./editor-context";
import { MutationContext } from "./mutation-context";
import { MutationProvider } from "./mutation-provider";
import { SDCPNContext, type SDCPNContextValue } from "./sdcpn-context";
import {
  defaultUserSettings,
  UserSettingsContext,
  type UserSettingsContextValue,
} from "./user-settings-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

function makeSDCPN(partial?: Partial<SDCPN>): SDCPN {
  return { ...EMPTY_SDCPN, ...partial };
}

const DEFAULT_SIMULATION: SimulationContextValue = {
  state: "NotRun",
  error: null,
  errorItemId: null,
  parameterValues: {},
  initialMarking: new Map(),
  selectedScenarioId: null,
  scenarioParameterValues: {},
  compiledScenarioResult: null,
  dt: 0.01,
  maxTime: null,
  totalFrames: 0,
  getFrame: () => Promise.resolve(null),
  getAllFrames: () => Promise.resolve([]),
  getFramesInRange: () => Promise.resolve([]),
  setSelectedScenarioId: () => {},
  setScenarioParameterValue: () => {},
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setDt: () => {},
  setMaxTime: () => {},
  initialize: () => Promise.resolve(),
  run: () => {},
  pause: () => {},
  reset: () => {},
  setBackpressure: () => {},
  ack: () => {},
};

const DEFAULT_EDITOR: EditorContextValue = {
  ...initialEditorState,
  setGlobalMode: () => {},
  setEditionMode: () => {},
  setCursorMode: () => {},
  setLeftSidebarOpen: () => {},
  setLeftSidebarWidth: () => {},
  setPropertiesPanelWidth: () => {},
  setBottomPanelOpen: () => {},
  toggleBottomPanel: () => {},
  setBottomPanelHeight: () => {},
  setActiveBottomPanelTab: () => {},
  isSelected: () => false,
  isSelectedConnection: () => false,
  isNotSelectedConnection: () => false,
  isHoveredConnection: () => false,
  isNotHoveredConnection: () => false,
  selectedConnections: new Map(),
  setSelection: () => {},
  selectItem: () => {},
  toggleItem: () => {},
  clearSelection: () => {},
  setHoveredItem: () => {},
  clearHoveredItem: () => {},
  isHovered: () => false,
  setDraggingStateByNodeId: () => {},
  updateDraggingStateByNodeId: () => {},
  resetDraggingState: () => {},
  collapseAllPanels: () => {},
  setTimelineChartType: () => {},
  setSearchOpen: () => {},
  searchInputRef: { current: null },
  triggerPanelAnimation: () => {},
  __reinitialize: () => {},
};

const DEFAULT_USER_SETTINGS: UserSettingsContextValue = {
  ...defaultUserSettings,
  setShowAnimations: () => {},
  setKeepPanelsMounted: () => {},
  setCompactNodes: () => {},
  setArcRendering: () => {},
  setIsLeftSidebarOpen: () => {},
  setLeftSidebarWidth: () => {},
  setPropertiesPanelWidth: () => {},
  setIsBottomPanelOpen: () => {},
  setBottomPanelHeight: () => {},
  setActiveBottomPanelTab: () => {},
  setCursorMode: () => {},
  setTimelineChartType: () => {},
  setShowMinimap: () => {},
  setSnapToGrid: () => {},
  setPartialSelection: () => {},
  setUseEntitiesTreeView: () => {},
  updateSubViewSection: () => {},
};

type WrapperOptions = {
  sdcpn?: SDCPN;
  readonly?: boolean;
  globalMode?: "edit" | "simulate";
  simulationState?: SimulationContextValue["state"];
};

/**
 * Creates a wrapper that provides all required contexts for MutationProvider.
 * Returns the wrapper and a ref to the latest SDCPN state (after mutations).
 */
function createWrapper(options: WrapperOptions = {}) {
  const {
    sdcpn: initialSdcpn = EMPTY_SDCPN,
    readonly = false,
    globalMode = "edit",
    simulationState = "NotRun",
  } = options;

  // Track mutations via immer-style produce pattern
  let currentSdcpn = structuredClone(initialSdcpn);
  const mutateFn = vi.fn((fn: (sdcpn: SDCPN) => void) => {
    const draft = structuredClone(currentSdcpn);
    fn(draft);
    currentSdcpn = draft;
  });

  const sdcpnContextValue: SDCPNContextValue = {
    createNewNet: () => {},
    existingNets: [],
    loadPetriNet: () => {},
    petriNetId: "test-net",
    petriNetDefinition: initialSdcpn,
    readonly,
    setTitle: () => {},
    title: "Test",
    getItemType: () => null,
  };

  const editorContextValue: EditorContextValue = {
    ...DEFAULT_EDITOR,
    globalMode,
  };

  const simulationContextValue: SimulationContextValue = {
    ...DEFAULT_SIMULATION,
    state: simulationState,
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SDCPNContext.Provider value={sdcpnContextValue}>
      <SimulationContext.Provider value={simulationContextValue}>
        <UserSettingsContext.Provider value={DEFAULT_USER_SETTINGS}>
          <EditorContext.Provider value={editorContextValue}>
            <MutationProvider mutatePetriNetDefinition={mutateFn}>
              {children}
            </MutationProvider>
          </EditorContext.Provider>
        </UserSettingsContext.Provider>
      </SimulationContext.Provider>
    </SDCPNContext.Provider>
  );

  return { Wrapper, mutateFn, getSdcpn: () => currentSdcpn };
}

function useMutations() {
  return use(MutationContext);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MutationProvider", () => {
  describe("when not readonly", () => {
    test("addPlace mutates SDCPN", () => {
      const { Wrapper, mutateFn, getSdcpn } = createWrapper();
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.addPlace({
          id: "p1",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        });
      });

      expect(mutateFn).toHaveBeenCalledTimes(1);
      expect(getSdcpn().places).toHaveLength(1);
      expect(getSdcpn().places[0]!.id).toBe("p1");
    });

    test("addTransition mutates SDCPN", () => {
      const { Wrapper, mutateFn, getSdcpn } = createWrapper();
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.addTransition({
          id: "t1",
          name: "Trans1",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        });
      });

      expect(mutateFn).toHaveBeenCalledTimes(1);
      expect(getSdcpn().transitions).toHaveLength(1);
    });

    test("commitNodePositions updates positions", () => {
      const sdcpn = makeSDCPN({
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "T1",
            inputArcs: [],
            outputArcs: [],
            lambdaType: "predicate",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 0,
            y: 0,
          },
        ],
      });
      const { Wrapper, getSdcpn } = createWrapper({ sdcpn });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.commitNodePositions([
          { id: "p1", itemType: "place", position: { x: 100, y: 200 } },
          { id: "t1", itemType: "transition", position: { x: 300, y: 400 } },
        ]);
      });

      expect(getSdcpn().places[0]!.x).toBe(100);
      expect(getSdcpn().places[0]!.y).toBe(200);
      expect(getSdcpn().transitions[0]!.x).toBe(300);
      expect(getSdcpn().transitions[0]!.y).toBe(400);
    });
  });

  describe("readonly enforcement", () => {
    test("mutations no-op when readonly prop is true", () => {
      const { Wrapper, mutateFn } = createWrapper({ readonly: true });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.addPlace({
          id: "p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        });
      });

      expect(mutateFn).not.toHaveBeenCalled();
    });

    test("mutations no-op when globalMode is simulate", () => {
      const { Wrapper, mutateFn } = createWrapper({
        globalMode: "simulate",
      });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.addPlace({
          id: "p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        });
      });

      expect(mutateFn).not.toHaveBeenCalled();
    });

    test("mutations no-op when simulation is Running", () => {
      const { Wrapper, mutateFn } = createWrapper({
        simulationState: "Running",
      });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.addTransition({
          id: "t1",
          name: "T1",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        });
      });

      expect(mutateFn).not.toHaveBeenCalled();
    });

    test("mutations no-op when simulation is Paused", () => {
      const { Wrapper, mutateFn } = createWrapper({
        simulationState: "Paused",
      });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.removeType("type-1");
      });

      expect(mutateFn).not.toHaveBeenCalled();
    });

    test("mutations no-op when simulation is Complete", () => {
      const { Wrapper, mutateFn } = createWrapper({
        simulationState: "Complete",
      });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.removeParameter("param-1");
      });

      expect(mutateFn).not.toHaveBeenCalled();
    });

    test("pasteEntities returns null when readonly", async () => {
      const { Wrapper } = createWrapper({ readonly: true });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      let pasteResult: unknown;
      await act(async () => {
        pasteResult = await result.current.pasteEntities();
      });

      expect(pasteResult).toBeNull();
    });

    test("commitNodePositions no-ops when readonly", () => {
      const sdcpn = makeSDCPN({
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
      });
      const { Wrapper, mutateFn } = createWrapper({
        sdcpn,
        readonly: true,
      });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.commitNodePositions([
          { id: "p1", itemType: "place", position: { x: 100, y: 200 } },
        ]);
      });

      expect(mutateFn).not.toHaveBeenCalled();
    });
  });

  describe("cascading deletes", () => {
    test("removePlace cascades to remove connected arcs", () => {
      const sdcpn = makeSDCPN({
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
          {
            id: "p2",
            name: "P2",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 100,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "T1",
            inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "predicate",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 50,
            y: 0,
          },
        ],
      });
      const { Wrapper, getSdcpn } = createWrapper({ sdcpn });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.removePlace("p1");
      });

      expect(getSdcpn().places).toHaveLength(1);
      expect(getSdcpn().places[0]!.id).toBe("p2");
      expect(getSdcpn().transitions[0]!.inputArcs).toHaveLength(0);
      expect(getSdcpn().transitions[0]!.outputArcs).toHaveLength(1);
    });

    test("removeType cascades to clear colorId on places and equations", () => {
      const sdcpn = makeSDCPN({
        types: [
          {
            id: "type-1",
            name: "MyType",
            iconSlug: "circle",
            displayColor: "#f00",
            elements: [],
          },
        ],
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: "type-1",
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        differentialEquations: [
          {
            id: "eq-1",
            name: "Eq1",
            colorId: "type-1",
            code: "",
          },
        ],
      });
      const { Wrapper, getSdcpn } = createWrapper({ sdcpn });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.removeType("type-1");
      });

      expect(getSdcpn().types).toHaveLength(0);
      expect(getSdcpn().places[0]!.colorId).toBeNull();
      expect(getSdcpn().differentialEquations[0]!.colorId).toBe("");
    });

    test("removeDifferentialEquation cascades to clear differentialEquationId on places", () => {
      const sdcpn = makeSDCPN({
        differentialEquations: [
          { id: "eq-1", name: "Eq1", colorId: "", code: "" },
        ],
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: null,
            dynamicsEnabled: true,
            differentialEquationId: "eq-1",
            x: 0,
            y: 0,
          },
        ],
      });
      const { Wrapper, getSdcpn } = createWrapper({ sdcpn });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      act(() => {
        result.current.removeDifferentialEquation("eq-1");
      });

      expect(getSdcpn().differentialEquations).toHaveLength(0);
      expect(getSdcpn().places[0]!.differentialEquationId).toBeNull();
    });

    test("deleteItemsByIds handles mixed item types with cascading", () => {
      const sdcpn = makeSDCPN({
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: "type-1",
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
          {
            id: "p2",
            name: "P2",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 100,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "T1",
            inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "predicate",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 50,
            y: 0,
          },
        ],
        types: [
          {
            id: "type-1",
            name: "T",
            iconSlug: "circle",
            displayColor: "#f00",
            elements: [],
          },
        ],
        parameters: [
          {
            id: "param-1",
            name: "P",
            variableName: "p",
            type: "real",
            defaultValue: "0",
          },
        ],
      });
      const { Wrapper, getSdcpn } = createWrapper({ sdcpn });
      const { result } = renderHook(useMutations, { wrapper: Wrapper });

      const items = new Map([
        ["p1", { type: "place" as const, id: "p1" }],
        ["type-1", { type: "type" as const, id: "type-1" }],
        ["param-1", { type: "parameter" as const, id: "param-1" }],
      ]);

      act(() => {
        result.current.deleteItemsByIds(items);
      });

      const final = getSdcpn();
      expect(final.places).toHaveLength(1);
      expect(final.places[0]!.id).toBe("p2");
      expect(final.transitions[0]!.inputArcs).toHaveLength(0);
      expect(final.types).toHaveLength(0);
      expect(final.parameters).toHaveLength(0);
    });
  });
});
