/**
 * The AI assistant a plugin provides: which running plugin provides it, the
 * panel state its content reads, and the title bar its content fills.
 */

import { createContext, type ReactNode, use } from "react";
import { createPortal } from "react-dom";

import { PluginBoundary } from "./plugin-boundary";
import { useRunningPluginsSelector } from "./plugins-provider";

/** The assistant panel's state, as its content reads it. */
export interface AssistantPanel {
  readonly isOpen: boolean;
  readonly close: () => void;
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

/** The title bar elements `AssistantPanelTitle` renders into. */
interface AssistantTitleBar {
  readonly title: HTMLElement | null;
  readonly actions: HTMLElement | null;
}

export const AssistantTitleBarContext = createContext<AssistantTitleBar | null>(
  null,
);

/**
 * Fills the assistant panel's title bar from the panel's content: `children`
 * after the assistant icon, such as a title or tabs, and `actions` before the
 * panel's dock and Close buttons. A floating panel drags from the title's text
 * and containers; buttons, links, form fields and other focusable controls
 * take their own clicks.
 */
export const AssistantPanelTitle = ({
  children,
  actions,
}: {
  children?: ReactNode;
  actions?: ReactNode;
}) => {
  const titleBar = use(AssistantTitleBarContext);

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
