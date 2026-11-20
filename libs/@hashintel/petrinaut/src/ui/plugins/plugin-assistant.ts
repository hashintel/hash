/**
 * The AI assistant a plugin provides: which running plugin's assistant the
 * editor shows, the panel state its content reads, and the title bar its
 * content fills.
 */

import { createContext, use } from "react";

import {
  useUserSettings,
  useUserSettingsFields,
} from "../../react/state/user-settings-context";
import {
  type RunningPlugin,
  usePluginStatuses,
  useRunningPluginsSelector,
} from "./running-plugins";

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
 * The assistant the editor shows among `assistants`: the one the user chose
 * while it is there, else the first.
 */
const pickAssistant = <
  Assistant extends { readonly manifest: { readonly id: string } },
>(
  assistants: readonly Assistant[],
  chosenId: string | null,
): Assistant | undefined =>
  assistants.find(({ manifest }) => manifest.id === chosenId) ?? assistants[0];

const providesAssistant = ({ manifest, contributions }: RunningPlugin) =>
  manifest.assistant === true && contributions.assistant !== undefined;

/** The running plugin whose assistant the editor shows, or `undefined`. */
export const usePluginAssistant = () => {
  const assistantPluginId = useUserSettings(
    (settings) => settings.assistantPluginId,
  );

  return useRunningPluginsSelector((running) =>
    pickAssistant(running.filter(providesAssistant), assistantPluginId),
  );
};

/**
 * The running plugins that provide an assistant, the one the editor shows,
 * and the user's choice between them.
 */
export const useAssistantChoice = () => {
  const { assistantPluginId, setAssistantPluginId } = useUserSettingsFields(
    "assistantPluginId",
    "setAssistantPluginId",
  );
  // Selected as a string, so an assistant republishing its contributions, as
  // a streaming chat does, re-renders none of the choice's readers.
  const assistantIds = useRunningPluginsSelector((running) =>
    running
      .filter(providesAssistant)
      .map(({ manifest }) => manifest.id)
      .join("\n"),
  ).split("\n");
  const assistants = usePluginStatuses()
    .map(({ plugin }) => plugin)
    .filter(({ manifest }) => assistantIds.includes(manifest.id));

  return {
    assistants: assistants.map(({ manifest }) => manifest),
    shownId: pickAssistant(assistants, assistantPluginId)?.manifest.id,
    choose: setAssistantPluginId,
  };
};
