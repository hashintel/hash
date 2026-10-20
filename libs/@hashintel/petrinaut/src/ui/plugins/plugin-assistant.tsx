/**
 * The AI assistant a plugin provides: which running plugin provides it, the
 * panel state its content reads, and the title bar its content fills.
 */

import { createContext, type ReactNode, use, useEffect } from "react";
import { createPortal } from "react-dom";

import { PluginBoundary } from "./plugin-boundary";
import { useRunningPluginsSelector } from "./plugins-provider";

/** What the empty-canvas prompt asks for when it opens the assistant panel. */
export type AssistantStartRequest =
  | { readonly text: string }
  | { readonly action: string };

/** The assistant panel's state, as its content reads it. */
export interface AssistantPanel {
  readonly isOpen: boolean;
  readonly close: () => void;
  /** Changes each time the user opens the panel, so the content can focus its composer. */
  readonly focusRequest: number;
  /**
   * `true` while the panel shrinks to a dock in the corner, e.g. during a
   * voice session. The title bar is hidden and the content may overflow the
   * dock, for a popover above it.
   */
  readonly collapsed: boolean;
  readonly setCollapsed: (collapsed: boolean) => void;
  /** What the empty-canvas prompt asked for, until the content consumes it. */
  readonly startRequest: AssistantStartRequest | null;
  readonly consumeStartRequest: () => void;
}

export const AssistantPanelContext = createContext<AssistantPanel | null>(null);

/** The assistant panel's state. Call it inside a plugin's `assistant.content`. */
export const useAssistantPanel = (): AssistantPanel => {
  const panel = use(AssistantPanelContext);
  if (panel === null) {
    throw new Error(
      "useAssistantPanel is called outside the assistant panel's content",
    );
  }
  return panel;
};

/** The title bar elements `AssistantPanelTitle` renders into, and its Close button's handler. */
interface AssistantTitleBar {
  readonly title: HTMLElement | null;
  readonly actions: HTMLElement | null;
  readonly setCloseHandler: (handler: (() => void) | undefined) => void;
}

export const AssistantTitleBarContext = createContext<AssistantTitleBar | null>(
  null,
);

/**
 * Fills the assistant panel's title bar from the panel's content: `children`
 * after the assistant icon, such as a title or tabs, and `actions` between the
 * dock toggle and the Close button. `onClose` runs when the user presses
 * Close, before the panel closes. A floating panel drags from the title's text
 * and containers; buttons, links, form fields and other focusable controls
 * take their own clicks.
 */
export const AssistantPanelTitle = ({
  children,
  actions,
  onClose,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
}) => {
  const titleBar = use(AssistantTitleBarContext);
  const setCloseHandler = titleBar?.setCloseHandler;
  useEffect(() => {
    if (setCloseHandler === undefined) {
      return;
    }
    setCloseHandler(onClose);
    return () => setCloseHandler(undefined);
  }, [setCloseHandler, onClose]);

  return (
    <>
      {titleBar?.title && createPortal(children, titleBar.title)}
      {titleBar?.actions && createPortal(actions, titleBar.actions)}
    </>
  );
};

/** The first running plugin that provides the assistant, or `undefined`. */
export const usePluginAssistant = () =>
  useRunningPluginsSelector((running) =>
    running.find(
      ({ manifest, contributions }) =>
        manifest.assistant === true && contributions.assistant !== undefined,
    ),
  );

/** A plugin's assistant content behind that plugin's error boundary. */
export const PluginAssistantContent = ({
  pluginId,
  children,
}: {
  pluginId: string;
  children: ReactNode;
}) => (
  <PluginBoundary pluginId={pluginId} place="assistant">
    {children}
  </PluginBoundary>
);
