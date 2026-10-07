import { type ReactNode, useState } from "react";

import { DEFAULT_AI_ASSISTANT_WIDTH } from "../../../../react/state/panel-defaults";
import {
  type AssistantWindowHost,
  AssistantWindowContext,
  type AssistantWindowPlacement,
  type AssistantWindowTab,
  chatTabId,
  resolveActiveTabId,
} from "./window-host";

const noTabs: readonly AssistantWindowTab[] = [];

export interface PetrinautAssistantWindowPreviewProps {
  /** Where the window starts; the user can float or dock it. */
  readonly placement?: AssistantWindowPlacement;
  /** Whether the chat starts compact. */
  readonly compact?: boolean;
  /** Tabs beside the chat, as an assistant adds them. */
  readonly tabs?: readonly AssistantWindowTab[];
  /** The chat, which draws `PetrinautAssistantWindow`. */
  readonly children: ReactNode;
}

/**
 * Hosts an assistant chat outside an editor, for previews and tests: the
 * window opens over the nearest positioned container and keeps its own
 * placement, width, compact state and shown tab. Closing it hides it.
 */
export const PetrinautAssistantWindowPreview = ({
  placement: initialPlacement = "docked",
  compact: initialCompact = false,
  tabs = noTabs,
  children,
}: PetrinautAssistantWindowPreviewProps) => {
  const [isOpen, setOpen] = useState(true);
  const [placement, setPlacement] = useState(initialPlacement);
  const [width, setWidth] = useState(DEFAULT_AI_ASSISTANT_WIDTH);
  const [compact, setCompact] = useState(initialCompact);
  const [chosenTabId, setChosenTabId] = useState(chatTabId);

  const host: AssistantWindowHost = {
    isOpen,
    close: () => setOpen(false),
    placement,
    setPlacement,
    width,
    setWidth,
    isAnimating: false,
    reportDockHeight: () => {},
    compact,
    setCompact,
    tabs,
    activeTabId: resolveActiveTabId(tabs, chosenTabId),
    setActiveTabId: setChosenTabId,
    focusRequest: 0,
    startRequest: null,
    consumeStartRequest: () => {},
  };

  return (
    <AssistantWindowContext value={host}>{children}</AssistantWindowContext>
  );
};
