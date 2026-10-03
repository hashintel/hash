import { use, useLayoutEffect, useMemo, useSyncExternalStore } from "react";

import { useCommand } from "../../react/commands/command-registry";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { useStore } from "../../react/use-store";
import { useInstalledPlugins, usePluginRuntime } from "./plugins-provider";

import type { PetrinautAiAssistant } from "../petrinaut";
import type {
  PetrinautAssistantProvider,
  PetrinautAssistantTab,
} from "./define-petrinaut-plugin";

/** An installed plugin's assistant: its label from the manifest and its provider. */
export interface InstalledAssistant {
  readonly pluginId: string;
  readonly label: string;
  readonly provider: PetrinautAssistantProvider;
}

const nullStore = { get: () => null, subscribe: () => () => {} };
const emptyTabs: readonly PetrinautAssistantTab[] = [];
const noTabsStore = {
  get: () => emptyTabs,
  subscribe: () => () => {},
};

export const useInstalledAssistants = (): readonly InstalledAssistant[] => {
  const plugins = useInstalledPlugins();
  return useMemo(
    () =>
      plugins.flatMap(({ manifest, providers }) =>
        manifest.assistant && providers.assistant
          ? [
              {
                pluginId: manifest.id,
                label: manifest.assistant.label,
                provider: providers.assistant,
              },
            ]
          : [],
      ),
    [plugins],
  );
};

/**
 * The active assistant: the chosen one while it is installed, otherwise the
 * first installed, otherwise none. A stale choice falls back without being
 * cleared, so it applies again once its plugin is back.
 */
export const resolveActiveAssistant = (
  assistants: readonly InstalledAssistant[],
  chosenPluginId: string | null,
): InstalledAssistant | undefined =>
  assistants.find(({ pluginId }) => pluginId === chosenPluginId) ??
  assistants[0];

/** The assistant the editor shows, before its chat is ready. */
export const useActiveAssistant = (): InstalledAssistant | undefined => {
  const assistants = useInstalledAssistants();
  const { aiAssistantId } = use(UserSettingsContext);
  return resolveActiveAssistant(assistants, aiAssistantId);
};

/**
 * The active assistant's window content: the chat kit configuration and the
 * plugin's tabs. `null` while no assistant is installed or the active one has
 * not published a chat for this document.
 */
export const useActiveAssistantContent = (): {
  pluginId: string;
  label: string;
  chat: PetrinautAiAssistant;
  tabs: readonly PetrinautAssistantTab[];
} | null => {
  const active = useActiveAssistant();
  const chat = useStore(active?.provider.chat ?? nullStore);
  const tabs = useStore(active?.provider.tabs ?? noTabsStore);
  return active && chat
    ? { pluginId: active.pluginId, label: active.label, chat, tabs }
    : null;
};

/**
 * Whether the AI panel has an assistant to show. Re-renders only when that
 * changes, for the canvas and the controls that make room for the panel.
 */
export const useHasActiveAiAssistant = (): boolean => {
  const active = useActiveAssistant();
  const store = active?.provider.chat;
  return useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.get() !== null && store !== undefined,
  );
};

/** The installed assistants and the active one, for the settings selector. */
export const useAssistantChoice = () => {
  const assistants = useInstalledAssistants();
  const active = useActiveAssistant();
  const { setAiAssistantId } = use(UserSettingsContext);
  return {
    assistants: assistants.map(({ pluginId, label }) => ({
      id: pluginId,
      label,
    })),
    activeId: active?.pluginId,
    choose: setAiAssistantId,
  };
};

const AssistantSwitchCommand = ({
  assistant,
}: {
  assistant: InstalledAssistant;
}) => {
  const { setAiAssistantId } = use(UserSettingsContext);
  useCommand({
    id: `petrinaut.ai-assistant.use:${assistant.pluginId}`,
    label: `Use the ${assistant.label} assistant`,
    category: "Editor",
    keywords: ["assistant", "ai", "switch", assistant.label],
    run: () => setAiAssistantId(assistant.pluginId),
  });
  return null;
};

/**
 * Tells the runtime which assistant is active, so plugins see
 * `api.assistant.isActive`, and registers a palette command for each of the
 * others once two or more are installed.
 */
export const AssistantResolution = () => {
  const runtime = usePluginRuntime();
  const assistants = useInstalledAssistants();
  const active = useActiveAssistant();
  const activeId = active?.pluginId ?? null;
  useLayoutEffect(() => {
    runtime.setActiveAssistant(activeId);
  }, [runtime, activeId]);
  return assistants.length > 1
    ? assistants
        .filter(({ pluginId }) => pluginId !== activeId)
        .map((assistant) => (
          <AssistantSwitchCommand
            key={assistant.pluginId}
            assistant={assistant}
          />
        ))
    : null;
};
