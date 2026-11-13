/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  createJsonDocHandle,
  createPetrinaut,
  providedComponentSubnetId,
  toPetrinautId,
  type Petrinaut,
  type ProvidedComponent,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../instance-context";
import {
  NotificationsContext,
  type AddNotificationInput,
} from "../notifications/context";
import {
  SimulationContext,
  type SimulationState,
  DEFAULT_SIMULATION_CONTEXT,
} from "../simulation/context";
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
  navigateTo: () => {},
  setGlobalMode: () => {},
  setEditViewMode: () => {},
  setEditionMode: () => {},
  setAddComponentMode: () => {},
  setCursorMode: () => {},
  setLeftSidebarOpen: () => {},
  setLeftSidebarWidth: () => {},
  setPropertiesPanelWidth: () => {},
  setAiAssistantWidth: () => {},
  setAiAssistantDockHeight: () => {},
  setAiAssistantPlacement: () => {},
  setAiAssistantCollapsed: () => {},
  setBottomPanelOpen: () => {},
  toggleBottomPanel: () => {},
  setBottomPanelHeight: () => {},
  setActiveBottomPanelTab: () => {},
  isSelected: () => false,
  setSelection: () => {},
  beginSelectionGesture: () => {},
  endSelectionGesture: () => {},
  selectItem: () => {},
  toggleItem: () => {},
  clearSelection: () => {},
  setHoveredItem: () => {},
  clearHoveredItem: () => {},
  keepPlaceVisualizerOpen: () => {},
  closePlaceVisualizer: () => {},
  toggleComponentInstanceFold: () => {},
  openPlaceVisualizer: () => {},
  setVisualizerEditorFocus: () => {},
  bringVisualizerToFront: () => {},
  setDraggingStateByNodeId: () => {},
  updateDraggingStateByNodeId: () => {},
  resetDraggingState: () => {},
  collapseAllPanels: () => {},
  setTimelineChartType: () => {},
  setTimelineView: () => {},
  setHiddenTimelineSeriesIds: () => {},
  setSimulateViewMode: () => {},
  setSimulateDrawer: () => {},
  setSearchOpen: () => {},
  setAiAssistantOpen: () => {},
  toggleAiAssistant: () => {},
  searchInputRef: { current: null },
  triggerPanelAnimation: () => {},
});

type WrapperOptions = {
  sdcpn?: SDCPN;
  readonly?: boolean;
  components?: readonly ProvidedComponent[];
  compositionOnly?: boolean;
  globalMode?: "edit" | "simulate";
  simulationState?: SimulationState;
};

const createWrapper = (options: WrapperOptions = {}) => {
  const {
    sdcpn: initialSdcpn = EMPTY_SDCPN,
    readonly = false,
    components,
    compositionOnly,
    globalMode = "edit",
    simulationState = "NotRun",
  } = options;

  const instance: Petrinaut = createPetrinaut({
    document: createJsonDocHandle({ initial: structuredClone(initialSdcpn) }),
    components,
    compositionOnly,
  });

  const sdcpnContextValue: SDCPNContextValue = {
    createNewNet: () => {},
    existingNets: [],
    loadPetriNet: () => {},
    petriNetId: "test-net",
    petriNetDefinition: instance.definition.get(),
    readonly,
    extensions: DEFAULT_PETRINAUT_EXTENSIONS,
    setTitle: () => {},
    title: "Test",
    getItemType: () => null,
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <PetrinautInstanceContext value={instance}>
      <SDCPNContext value={sdcpnContextValue}>
        <SimulationContext
          value={{ ...DEFAULT_SIMULATION_CONTEXT, state: simulationState }}
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
          x: 0,
          y: 0,
        });
      });

      const places = instance.definition.get().places;
      expect(places).toHaveLength(1);
      expect(places[0]!.id).toBe(toPetrinautId("p1"));
    });

    test("commitNodePositions updates positions", () => {
      const sdcpn = makeSDCPN({
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: null,
            dynamicsEnabled: false,
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

  describe("the host's rules", () => {
    test("a mutation they refuse shows the reason and does nothing", () => {
      const packer: ProvidedComponent = {
        id: "warehouse/packer",
        name: "Packer",
        ports: [{ name: "Orders", direction: "in" }],
      };
      const addNotification = vi.fn((_notice: AddNotificationInput) => "");
      const { Wrapper, instance } = createWrapper({ components: [packer] });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <NotificationsContext
            value={{ addNotification, dismissNotification: () => {} }}
          >
            <Wrapper>{children}</Wrapper>
          </NotificationsContext>
        ),
      });

      act(() => {
        result.current.updateSubnet({
          subnetId: providedComponentSubnetId(packer),
          update: { name: "Hijacked" },
        });
      });

      expect(addNotification).toHaveBeenCalledOnce();
      expect(addNotification.mock.calls[0]?.[0].message).toBe(
        "Packer is a component the application provides: it cannot be changed.",
      );
      expect(instance.definition.get().subnets).toBeUndefined();
    });
  });

  describe("in an editor that only composes", () => {
    test("a mutation beyond composing shows the reason and does nothing", () => {
      const addNotification = vi.fn((_notice: AddNotificationInput) => "");
      const { Wrapper, instance } = createWrapper({ compositionOnly: true });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <NotificationsContext
            value={{ addNotification, dismissNotification: () => {} }}
          >
            <Wrapper>{children}</Wrapper>
          </NotificationsContext>
        ),
      });

      act(() => {
        result.current.addPlace({
          id: "p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });

      expect(instance.definition.get().places).toHaveLength(0);
      expect(addNotification.mock.calls[0]?.[0].message).toBe(
        "This editor only places and connects the components it is given.",
      );
    });

    test("a mutation that composes goes through", () => {
      const sdcpn = makeSDCPN({
        places: [
          {
            id: "p1",
            name: "P1",
            colorId: null,
            dynamicsEnabled: false,
            x: 0,
            y: 0,
          },
        ],
      });
      const { Wrapper, instance } = createWrapper({
        sdcpn,
        compositionOnly: true,
      });
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
            x: 0,
            y: 0,
          },
          {
            id: "p2",
            name: "P2",
            colorId: null,
            dynamicsEnabled: false,
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
      expect(updated.places[0]!.id).toBe(toPetrinautId("p2"));
      expect(updated.transitions[0]!.inputArcs).toHaveLength(0);
    });
  });
});

test.each([
  [{ readonly: true }, "This document is read-only."],
  [{ globalMode: "simulate" }, "Switch to Edit to change this net."],
  [{ simulationState: "Paused" }, "Reset the simulation to edit this net."],
] satisfies [WrapperOptions, string][])(
  "explains blocked mutations for %j",
  (options, message) => {
    const { Wrapper, instance } = createWrapper(options);
    const addNotification = vi.fn(() => "notice");
    const { result } = renderHook(usePetrinautMutations, {
      wrapper: ({ children }) => (
        <Wrapper>
          <NotificationsContext
            value={{ addNotification, dismissNotification: () => {} }}
          >
            {children}
          </NotificationsContext>
        </Wrapper>
      ),
    });
    act(() =>
      result.current.addPlace({
        id: "blocked",
        name: "Blocked",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      }),
    );
    expect(instance.definition.get().places).toHaveLength(0);
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message, tone: "neutral" }),
    );
  },
);

test("allowed scenario mutations in Simulate stay quiet", () => {
  const { Wrapper, instance } = createWrapper({ globalMode: "simulate" });
  const addNotification = vi.fn(() => "notice");
  const { result } = renderHook(usePetrinautMutations, {
    wrapper: ({ children }) => (
      <Wrapper>
        <NotificationsContext
          value={{ addNotification, dismissNotification: () => {} }}
        >
          {children}
        </NotificationsContext>
      </Wrapper>
    ),
  });
  act(() =>
    result.current.addScenario({
      id: "scenario",
      name: "Scenario",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    }),
  );
  expect(instance.definition.get().scenarios).toHaveLength(1);
  expect(addNotification).not.toHaveBeenCalled();
});

describe("visualizer edits during simulation", () => {
  const place = {
    id: "p1",
    name: "Place",
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
    visualizerCode: "original",
  };
  test.each(["Running", "Paused", "Complete"] as const)(
    "allows only visualizer updates while %s",
    (simulationState) => {
      const { Wrapper, instance } = createWrapper({
        sdcpn: makeSDCPN({ places: [place] }),
        simulationState,
      });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });
      act(() =>
        result.current.updatePlace({
          placeId: "p1",
          update: { visualizerCode: "edited" },
        }),
      );
      expect(instance.definition.get().places[0]?.visualizerCode).toBe(
        "edited",
      );
      act(() =>
        result.current.updatePlace({
          placeId: "p1",
          update: { visualizerCode: "blocked", name: "Changed" },
        }),
      );
      expect(instance.definition.get().places[0]).toMatchObject({
        name: "Place",
        visualizerCode: "edited",
      });
      act(() =>
        result.current.updatePlace({
          placeId: "p1",
          update: { visualizerCode: undefined },
        }),
      );
      expect(
        instance.definition.get().places[0]?.visualizerCode,
      ).toBeUndefined();
    },
  );
  test.each([false, true])(
    "respects host read-only in simulate mode: %s",
    (readonly) => {
      const { Wrapper, instance } = createWrapper({
        sdcpn: makeSDCPN({ places: [place] }),
        globalMode: "simulate",
        readonly,
      });
      const { result } = renderHook(usePetrinautMutations, {
        wrapper: Wrapper,
      });
      act(() =>
        result.current.updatePlace({
          placeId: "p1",
          update: { visualizerCode: "edited" },
        }),
      );
      expect(instance.definition.get().places[0]?.visualizerCode).toBe(
        readonly ? "original" : "edited",
      );
    },
  );
});
