/**
 * The AI assistant a plugin provides: which running plugin's assistant the
 * editor shows, the panel state its content reads, and the title bar its
 * content fills.
 */

import { createContext, type ReactNode, use } from "react";
import { createPortal } from "react-dom";

import { UserSettingsContext } from "../../react/state/user-settings-context";
import { PluginBoundary } from "./plugin-boundary";
import {
  type RunningPlugin,
  useRunningPluginsSelector,
} from "./plugins-provider";

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
 * after the assistant icon, such as a title or tabs, and `actions` between the
 * dock toggle and the Close button. A floating panel drags from the title's
 * text and containers; buttons, links, form fields and other focusable
 * controls take their own clicks.
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

/**
 * The assistant the editor shows among `assistants`: the one the user chose
 * while it is there, else the first.
 */
const pickAssistant = (
  assistants: readonly RunningPlugin[],
  chosenId: string | null,
): RunningPlugin | undefined =>
  assistants.find(({ manifest }) => manifest.id === chosenId) ?? assistants[0];

const providesAssistant = ({ manifest, contributions }: RunningPlugin) =>
  manifest.assistant === true && contributions.assistant !== undefined;

/** Whether two lists hold the same plugins in the same order. */
const samePlugins = (
  previous: readonly RunningPlugin[],
  next: readonly RunningPlugin[],
) =>
  previous.length === next.length &&
  previous.every(({ manifest }, index) => manifest === next[index]?.manifest);

/** The running plugin whose assistant the editor shows, or `undefined`. */
export const usePluginAssistant = () => {
  const { assistantPluginId } = use(UserSettingsContext);

  return useRunningPluginsSelector((running) =>
    pickAssistant(running.filter(providesAssistant), assistantPluginId),
  );
};

/**
 * The running plugins that provide an assistant, the one the editor shows,
 * and the user's choice between them.
 */
export const useAssistantChoice = () => {
  const { assistantPluginId, setAssistantPluginId } = use(UserSettingsContext);
  // Compared by plugin, so an assistant republishing its contributions, as a
  // streaming chat does, re-renders none of the choice's readers.
  const assistants = useRunningPluginsSelector(
    (running) => running.filter(providesAssistant),
    samePlugins,
  );

  return {
    assistants: assistants.map(({ manifest }) => manifest),
    shownId: pickAssistant(assistants, assistantPluginId)?.manifest.id,
    choose: setAssistantPluginId,
  };
};

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
