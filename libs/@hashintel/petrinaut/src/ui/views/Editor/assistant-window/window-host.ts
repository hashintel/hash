import { createContext, type ReactNode } from "react";

import { DEFAULT_AI_ASSISTANT_WIDTH } from "../../../../react/state/panel-defaults";

/** The chat tab's id among the window's tabs; every other id is another tab's. */
export const chatTabId = "chat";

/** A tab in the assistant window, shown after the chat tab. */
export interface AssistantWindowTab {
  /** Identifies the tab among the window's tabs; never `"chat"`, the chat tab's id. */
  readonly id: string;
  /** Text shown on the tab, also its accessible name. */
  readonly label: string;
  /** Decorative content before the label, such as an icon. */
  readonly mark?: ReactNode;
  /**
   * Stable ids of the activity the tab lists; ids that appear while the tab is
   * hidden badge it. The first list is the baseline; `undefined` until the
   * activity is known.
   */
  readonly activityIdentities?: readonly (number | string)[];
  /** What the tab renders; it stays mounted while another tab shows. */
  readonly content: ReactNode;
}

/**
 * How an entry point outside the chat starts it: with a first message, or
 * with one of the assistant's start actions, by id.
 */
export type PetrinautAssistantStartRequest =
  | {
      /** A first message to send, from the empty-net prompt. */
      readonly text: string;
    }
  | {
      /** The id of the start action the user picked. */
      readonly action: string;
    };

export type AssistantWindowPlacement = "docked" | "floating";

/** The window's state and controls, from the editor or a preview. */
export interface AssistantWindowHost {
  readonly isOpen: boolean;
  readonly close: () => void;
  readonly placement: AssistantWindowPlacement;
  readonly setPlacement: (placement: AssistantWindowPlacement) => void;
  readonly width: number;
  readonly setWidth: (width: number) => void;
  /** Whether the editor is animating its panels, so the window animates with them. */
  readonly isAnimating: boolean;
  /** The compact window's height, which the canvas keeps clear of; `null` otherwise. */
  readonly reportDockHeight: (height: number | null) => void;
  /** Whether the chat asked for the compact window. */
  readonly compact: boolean;
  readonly setCompact: (compact: boolean) => void;
  /** The tabs beside the chat. */
  readonly tabs: readonly AssistantWindowTab[];
  /** `chatTabId` or the id of a listed tab. */
  readonly activeTabId: string;
  readonly setActiveTabId: (tabId: string) => void;
  /** Grows each time the window is opened from a command, to move focus into it. */
  readonly focusRequest: number;
  readonly startRequest: PetrinautAssistantStartRequest | null;
  readonly consumeStartRequest: () => void;
}

const ignore = () => {};

/** Outside an editor or a preview: an open, docked window without tabs. */
const standaloneHost: AssistantWindowHost = {
  isOpen: true,
  close: ignore,
  placement: "docked",
  setPlacement: ignore,
  width: DEFAULT_AI_ASSISTANT_WIDTH,
  setWidth: ignore,
  isAnimating: false,
  reportDockHeight: ignore,
  compact: false,
  setCompact: ignore,
  tabs: [],
  activeTabId: chatTabId,
  setActiveTabId: ignore,
  focusRequest: 0,
  startRequest: null,
  consumeStartRequest: ignore,
};

export const AssistantWindowContext =
  createContext<AssistantWindowHost>(standaloneHost);

/** The id to show: the chosen tab while it is listed, the chat otherwise. */
export const resolveActiveTabId = (
  tabs: readonly { readonly id: string }[],
  chosenTabId: string,
): string =>
  tabs.some((tab) => tab.id === chosenTabId) ? chosenTabId : chatTabId;
