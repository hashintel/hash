import { use, useState } from "react";

import { EditorContext } from "../../../../react/state/editor-context";
import {
  type AssistantWindowHost,
  type AssistantWindowTab,
  chatTabId,
  type PetrinautAssistantStartRequest,
  resolveActiveTabId,
} from "./window-host";

/**
 * The editor's side of the assistant window. The state lives here, above the
 * chat, because the editor keys the chat per document: the shown tab, a
 * pending start request and focus requests survive that remount, and the
 * editor's own entry points reach them.
 */
export const useEditorAssistantWindowHost = (
  tabs: readonly AssistantWindowTab[],
) => {
  const {
    isAiAssistantOpen,
    setAiAssistantOpen,
    isAiAssistantCollapsed,
    setAiAssistantCollapsed,
    aiAssistantPlacement,
    setAiAssistantPlacement,
    aiAssistantWidth,
    setAiAssistantWidth,
    isPanelAnimating,
    setAiAssistantDockHeight,
  } = use(EditorContext);
  const [chosenTabId, setChosenTabId] = useState(chatTabId);
  const [focusRequest, setFocusRequest] = useState(0);
  const [startRequest, setStartRequest] =
    useState<PetrinautAssistantStartRequest | null>(null);

  const host: AssistantWindowHost = {
    isOpen: isAiAssistantOpen,
    close: () => setAiAssistantOpen(false),
    placement: aiAssistantPlacement,
    setPlacement: setAiAssistantPlacement,
    width: aiAssistantWidth,
    setWidth: setAiAssistantWidth,
    isAnimating: isPanelAnimating,
    reportDockHeight: setAiAssistantDockHeight,
    compact: isAiAssistantCollapsed,
    setCompact: setAiAssistantCollapsed,
    tabs,
    activeTabId: resolveActiveTabId(tabs, chosenTabId),
    setActiveTabId: setChosenTabId,
    focusRequest,
    startRequest,
    consumeStartRequest: () => setStartRequest(null),
  };

  return {
    host,
    /** Opens the window, handing the chat a request to start with. */
    start: (request: PetrinautAssistantStartRequest) => {
      setStartRequest(request);
      setAiAssistantOpen(true);
    },
    /** Opens the full window with focus in it, or closes it. */
    toggle: () => {
      if (isAiAssistantOpen) {
        setAiAssistantOpen(false);

        return;
      }
      setAiAssistantCollapsed(false);
      setAiAssistantOpen(true);
      setFocusRequest((request) => request + 1);
    },
  };
};
