/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type Petrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../instance-context";
import { SimulationContext, type SimulationState } from "../simulation/context";
import {
  EditorContext,
  type EditorContextValue,
  initialEditorState,
} from "../state/editor-context";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { usePetrinautMutations } from "./use-petrinaut-mutations";

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const makeSDCPN = (partial?: Partial<SDCPN>): SDCPN => ({
  ...EMPTY_SDCPN,
  ...partial,
});

const editorContextValue = (
  globalMode: "edit" | "simulate" = "edit",
): EditorContextValue => ({
  ...initialEditorState,
  globalMode,
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
  setTimelineView: () => {},
  setSimulateViewMode: () => {},
  setSimulateDrawer: () => {},
  setSearchOpen: () => {},
  setAiAssistantOpen: () => {},
  toggleAiAssistant: () => {},
  searchInputRef: { current: null },
  triggerPanelAnimation: () => {},
  __reinitialize: () => {},
});

type WrapperOptions = {
  sdcpn?: SDCPN;
  readonly?: boolean;
  globalMode?: "edit" | "simulate";
  simulationState?: SimulationState;
};

const createWrapper = (options: WrapperOptions = {}) => {
  const {
    sdcpn: initialSdcpn = EMPTY_SDCPN,
    readonly = false,
    globalMode = "edit",
    simulationState = "NotRun",
  } = options;

  const instance: Petrinaut = createPetrinaut({
    document: createJsonDocHandle({ initial: structuredClone(initialSdcpn) }),
  });

  const sdcpnContextValue: SDCPNContextValue = {
    createNewNet: () => {},
    existingNets: [],
    loadPetriNet: () => {},
    petriNetId: "test-net",
    petriNetDefinition: instance.definition.get(),
    readonly,
    setTitle: () => {},
    title: "Test",
    getItemType: () => null,
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <PetrinautInstanceContext value={instance}>
      <SDCPNContext value={sdcpnContextValue}>
        <SimulationContext
          value={{
            state: simulationState,
            error: null,
            errorItemId: null,
            parameterValues: {},
            initialMarking: {},
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
          }}
        >
          <EditorContext value={editorContextValue(globalMode)}>
            {children}
          </EditorContext>
        </SimulationContext>
      </SDCPNContext>
    </PetrinautInstanceContext>
  );

  return { Wrapper, instance };
};

describe("usePetrinautMutations", () => {
  describe("when not readonly", () => {
    test("addPlace mutates SDCPN", () => {
      const { Wrapper, instance } = createWrapper();
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

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

      const places = instance.definition.get().places;
      expect(places).toHaveLength(1);
      expect(places[0]!.id).toBe("p1");
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
      });
      const { Wrapper, instance } = createWrapper({ sdcpn });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.commitNodePositions({
          commits: [
            { id: "p1", itemType: "place", position: { x: 100, y: 200 } },
          ],
        });
      });

      expect(instance.definition.get().places[0]!.x).toBe(100);
      expect(instance.definition.get().places[0]!.y).toBe(200);
    });
  });

  describe("readonly enforcement", () => {
    test("mutations no-op when host readonly prop is true", () => {
      const { Wrapper, instance } = createWrapper({ readonly: true });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

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

      expect(instance.definition.get().places).toHaveLength(0);
    });

    test("mutations no-op when globalMode is simulate", () => {
      const { Wrapper, instance } = createWrapper({ globalMode: "simulate" });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

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

      expect(instance.definition.get().places).toHaveLength(0);
    });

    test("mutations no-op when simulation is Running/Paused/Complete", () => {
      for (const state of ["Running", "Paused", "Complete"] as const) {
        const { Wrapper, instance } = createWrapper({ simulationState: state });
        const { result } = renderHook(usePetrinautMutations, {
          wrapper: Wrapper,
        });

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

        expect(instance.definition.get().places).toHaveLength(0);
      }
    });

    test("scenario mutations still work in simulate mode", () => {
      const { Wrapper, instance } = createWrapper({ globalMode: "simulate" });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.addScenario({
          id: "scenario-1",
          name: "Default",
          scenarioParameters: [],
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        });
      });

      expect(instance.definition.get().scenarios ?? []).toHaveLength(1);
    });

    test("scenario mutations are blocked by host readonly", () => {
      const { Wrapper, instance } = createWrapper({ readonly: true });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.addScenario({
          id: "scenario-1",
          name: "Default",
          scenarioParameters: [],
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        });
      });

      expect(instance.definition.get().scenarios ?? []).toHaveLength(0);
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
      const { Wrapper, instance } = createWrapper({ sdcpn });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.removePlace({ placeId: "p1" });
      });

      const updated = instance.definition.get();
      expect(updated.places).toHaveLength(1);
      expect(updated.places[0]!.id).toBe("p2");
      expect(updated.transitions[0]!.inputArcs).toHaveLength(0);
    });
  });
});
