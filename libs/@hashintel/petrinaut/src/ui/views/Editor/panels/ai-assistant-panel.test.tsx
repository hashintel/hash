/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../../../../react/instance-context";
import {
  EditorContext,
  initialEditorState,
  type EditorContextValue,
} from "../../../../react/state/editor-context";
import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../../../../react/state/sdcpn-context";
import { definePetrinautAiInteractiveTool } from "../../../types/ai-interactive-tool";
import { AiAssistantPanel } from "./ai-assistant-panel";

import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel/types";
import type { UIMessageChunk } from "ai";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [],
  componentInstances: [],
};

const editorContextValue: EditorContextValue = {
  ...initialEditorState,
  isAiAssistantOpen: true,
  setGlobalMode: () => {},
  setEditionMode: () => {},
  setAddComponentMode: () => {},
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
  selectedConnections: new Map(),
  setSelection: () => {},
  selectItem: () => {},
  toggleItem: () => {},
  clearSelection: () => {},
  setHoveredItem: () => {},
  clearHoveredItem: () => {},
  isHovered: () => false,
  isHoveredConnection: () => false,
  isNotHoveredConnection: () => false,
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
  __reinitialize: () => {},
};

const streamChunks = (
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

afterEach(cleanup);

describe("AiAssistantPanel host interactive tools", () => {
  test("adds one dynamic output and sends one automatic follow-up", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(
            requestMessages.length === 1
              ? [
                  { type: "start-step" },
                  {
                    type: "tool-input-available",
                    dynamic: true,
                    toolCallId: "host-tool-call-1",
                    toolName: "confirmRelease",
                    input: { question: "Ship this change?" },
                  },
                ]
              : [
                  { type: "start-step" },
                  { type: "text-start", id: "follow-up" },
                  {
                    type: "text-delta",
                    id: "follow-up",
                    delta: "Release decision received.",
                  },
                  { type: "text-end", id: "follow-up" },
                ],
          ),
        );
      }),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "confirmRelease",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { approved: boolean },
      },
      component: ({ input, submit, toolCallId }) => (
        <button
          type="button"
          onClick={() => {
            submit({ approved: true });
            submit({ approved: true });
          }}
        >
          {`${toolCallId}: ${input.question}`}
        </button>
      ),
    });
    const handle = createJsonDocHandle({
      id: "interactive-tool-test",
      initial: emptySDCPN,
    });
    const instance = createPetrinaut({ document: handle });
    const sdcpnContext: SDCPNContextValue = {
      createNewNet: () => {},
      existingNets: [],
      loadPetriNet: () => {},
      petriNetId: "interactive-tool-test",
      petriNetDefinition: emptySDCPN,
      readonly: false,
      extensions: DEFAULT_PETRINAUT_EXTENSIONS,
      setTitle: () => {},
      title: "Interactive tool test",
      getItemType: () => null,
    };

    try {
      render(
        <PetrinautInstanceContext.Provider value={instance}>
          <EditorContext.Provider value={editorContextValue}>
            <SDCPNContext.Provider value={sdcpnContext}>
              <AiAssistantPanel
                aiAssistant={{ interactiveTools: [hostTool], transport }}
                initialMessage="Start the review"
              />
            </SDCPNContext.Provider>
          </EditorContext.Provider>
        </PetrinautInstanceContext.Provider>,
      );

      fireEvent.click(
        await screen.findByRole("button", {
          name: "host-tool-call-1: Ship this change?",
        }),
      );

      await screen.findByText("Release decision received.");
      await waitFor(() =>
        expect(transport.sendMessages).toHaveBeenCalledTimes(2),
      );

      const followUpParts = requestMessages[1]?.at(-1)?.parts ?? [];
      const submittedToolParts = followUpParts.filter(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === "host-tool-call-1" &&
          part.state === "output-available",
      );
      expect(submittedToolParts).toHaveLength(1);
      expect(submittedToolParts[0]).toMatchObject({
        output: { approved: true },
        toolCallId: "host-tool-call-1",
        toolName: "confirmRelease",
      });
    } finally {
      instance.dispose();
    }
  });
});
