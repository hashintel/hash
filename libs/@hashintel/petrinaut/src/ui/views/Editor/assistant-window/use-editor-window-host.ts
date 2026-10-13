import { use, useState } from "react";

import { EditorContext } from "../../../../react/state/editor-context";
import {
  type AssistantWindowHost,
  chatTabId,
  type PetrinautAssistantStartRequest,
  resolveActiveTabId,
} from "./window-host";

import type { PluginAssistantTab } from "../../../plugins/define-petrinaut-plugin";

/**
 * The editor's side of the assistant window. The state lives here, above the
 * assistant's view, because the editor keys the view per assistant and
 * document: the shown tab, a pending start request and focus requests survive
 * that remount, and the editor's own entry points reach them.
 */
export const useEditorAssistantWindowHost = () => {
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

  return {
    /** The window's host for the shown assistant's label and tabs. */
    hostFor: ({
      label,
      tabs,
    }: {
      label: string;
      tabs: readonly PluginAssistantTab[];
    }): AssistantWindowHost => ({
      label,
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
    }),
    /** Opens the window, handing the assistant a request to start with. */
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

/** The editor's assistant window state, as the window content reads it. */
export type EditorAssistantWindowHost = ReturnType<
  typeof useEditorAssistantWindowHost
>;
