import { type ReactNode, useState } from "react";

import { DEFAULT_AI_ASSISTANT_WIDTH } from "../../../../react/state/panel-defaults";
import {
  type AssistantWindowHost,
  AssistantWindowContext,
  type AssistantWindowPlacement,
  chatTabId,
  resolveActiveTabId,
  standaloneHost,
} from "./window-host";

import type { PluginAssistantTab } from "../../../plugins/define-petrinaut-plugin";

const noTabs: readonly PluginAssistantTab[] = [];

export interface PetrinautAssistantWindowPreviewProps {
  /** The assistant's name, as a manifest's `assistant.label` gives it. Defaults to `"AI"`. */
  readonly label?: string;
  /** Where the window starts; the user can float or dock it. */
  readonly placement?: AssistantWindowPlacement;
  /** Whether the chat starts compact. */
  readonly compact?: boolean;
  /** Tabs beside the chat, as an assistant plugin adds them. */
  readonly tabs?: readonly PluginAssistantTab[];
  /**
   * Replaces parts of the state the preview keeps, e.g. to start the
   * assistant with a request or to own the open state in a test.
   */
  readonly state?: Partial<
    Pick<
      AssistantWindowHost,
      | "isOpen"
      | "close"
      | "compact"
      | "setCompact"
      | "startRequest"
      | "consumeStartRequest"
    >
  >;
  /** The assistant's view, which draws `PetrinautAssistantWindow`. */
  readonly children: ReactNode;
}

/**
 * Hosts an assistant's view outside an editor, for previews and tests: the
 * window opens over the nearest positioned container and keeps its own
 * placement, width, compact state and shown tab. Closing it hides it.
 */
export const PetrinautAssistantWindowPreview = ({
  label = "AI",
  placement: initialPlacement = "docked",
  compact: initialCompact = false,
  tabs = noTabs,
  state,
  children,
}: PetrinautAssistantWindowPreviewProps) => {
  const [isOpen, setOpen] = useState(true);
  const [placement, setPlacement] = useState(initialPlacement);
  const [width, setWidth] = useState(DEFAULT_AI_ASSISTANT_WIDTH);
  const [compact, setCompact] = useState(initialCompact);
  const [chosenTabId, setChosenTabId] = useState(chatTabId);

  const host: AssistantWindowHost = {
    ...standaloneHost,
    label,
    isOpen,
    close: () => setOpen(false),
    placement,
    setPlacement,
    width,
    setWidth,
    compact,
    setCompact,
    tabs,
    activeTabId: resolveActiveTabId(tabs, chosenTabId),
    setActiveTabId: setChosenTabId,
    ...state,
  };

  return (
    <AssistantWindowContext value={host}>{children}</AssistantWindowContext>
  );
};
