/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, test } from "vitest";

import {
  CLIPBOARD_FORMAT_VERSION,
  type ClipboardPayload,
} from "../../core/clipboard/types";
import { createJsonDocHandle } from "../../core/handle";
import { createPetrinaut, type Petrinaut } from "../../core/instance";
import type { SDCPN } from "../../core/types/sdcpn";
import { PetrinautInstanceContext } from "../instance-context";
import { SimulationContext, type SimulationState } from "../simulation/context";
import {
  EditorContext,
  type EditorContextValue,
  initialEditorState,
} from "../state/editor-context";
import { SDCPNContext, type SDCPNContextValue } from "../state/sdcpn-context";
import { usePetrinautCommands } from "./use-petrinaut-commands";

const EMPTY_SDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

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

const samplePastePayload: ClipboardPayload = {
  format: "petrinaut-sdcpn",
  version: CLIPBOARD_FORMAT_VERSION,
  documentId: null,
  data: {
    places: [
      {
        id: "p1",
        name: "Pasted",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 10,
        y: 10,
      },
    ],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  },
};

describe("usePetrinautCommands", () => {
  describe("when not readonly", () => {
    test("applyClipboardPaste pastes new items and reports IDs", () => {
      const { Wrapper, instance } = createWrapper();
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      let output: ReturnType<typeof result.current.applyClipboardPaste>;
      act(() => {
        output = result.current.applyClipboardPaste({
          payload: samplePastePayload,
        });
      });

      expect(output!.newItemIds.some((item) => item.type === "place")).toBe(
        true,
      );
      expect(instance.definition.get().places).toHaveLength(1);
    });

    test("applyAutoLayout returns commitCount=0 on an empty net", async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      const { commitCount } = await result.current.applyAutoLayout();
      expect(commitCount).toBe(0);
    });
  });

  describe("readonly enforcement", () => {
    test("applyClipboardPaste is a no-op when host readonly is true", () => {
      const { Wrapper, instance } = createWrapper({ readonly: true });
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      let output: ReturnType<typeof result.current.applyClipboardPaste>;
      act(() => {
        output = result.current.applyClipboardPaste({
          payload: samplePastePayload,
        });
      });

      expect(output!.newItemIds).toEqual([]);
      expect(instance.definition.get().places).toHaveLength(0);
    });

    test("applyClipboardPaste is a no-op when globalMode is simulate", () => {
      const { Wrapper, instance } = createWrapper({ globalMode: "simulate" });
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      let output: ReturnType<typeof result.current.applyClipboardPaste>;
      act(() => {
        output = result.current.applyClipboardPaste({
          payload: samplePastePayload,
        });
      });

      expect(output!.newItemIds).toEqual([]);
      expect(instance.definition.get().places).toHaveLength(0);
    });

    test("applyAutoLayout returns commitCount=0 when readonly", async () => {
      const { Wrapper } = createWrapper({
        readonly: true,
        sdcpn: {
          ...EMPTY_SDCPN,
          places: [
            {
              id: "p1",
              name: "P",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 0,
              y: 0,
            },
          ],
        },
      });
      const { result } = renderHook(usePetrinautCommands, {
        wrapper: Wrapper,
      });

      const { commitCount } = await result.current.applyAutoLayout();
      expect(commitCount).toBe(0);
    });
  });
});
