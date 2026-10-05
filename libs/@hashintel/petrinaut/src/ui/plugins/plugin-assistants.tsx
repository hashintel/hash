import { use } from "react";

import { useCommand } from "../../react/commands/command-registry";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import {
  isAssistantExtension,
  isAssistantProvider,
  resolveActiveAssistantId,
} from "./active-assistant";
import {
  AssistantPresenceContext,
  type PetrinautPluginContribution,
  usePetrinautPlugins,
} from "./plugins-provider";

import type { PetrinautAiAssistant } from "../petrinaut";
import type {
  PetrinautAssistantExtension,
  PetrinautAssistantProvider,
  PetrinautAssistantTab,
} from "./define-petrinaut-plugin";

/** A plugin that provides an assistant: its id and the label from its manifest. */
export interface InstalledAssistant {
  readonly pluginId: string;
  readonly label: string;
}

export const useInstalledAssistants = (): readonly InstalledAssistant[] =>
  usePetrinautPlugins().flatMap(({ manifest }) =>
    isAssistantProvider(manifest)
      ? [{ pluginId: manifest.id, label: manifest.assistant.label }]
      : [],
  );

/** The assistant the editor shows, before its chat is ready. */
export const useActiveAssistant = (): InstalledAssistant | undefined => {
  const assistants = useInstalledAssistants();
  const { aiAssistantId } = use(UserSettingsContext);
  const activeId = resolveActiveAssistantId(
    usePetrinautPlugins().map(({ manifest }) => manifest),
    aiAssistantId,
  );

  return assistants.find(({ pluginId }) => pluginId === activeId);
};

/** A tab with the id of the plugin that contributes it, for its error boundary. */
export interface PetrinautResolvedAssistantTab extends PetrinautAssistantTab {
  readonly pluginId: string;
}

/** The shown assistant's window content, with every extension applied. */
export interface PetrinautActiveAssistant {
  readonly pluginId: string;
  readonly label: string;
  readonly chat: PetrinautAiAssistant;
  readonly tabs: readonly PetrinautResolvedAssistantTab[];
}

const providerOf = (
  contribution: PetrinautPluginContribution,
): PetrinautAssistantProvider | undefined =>
  isAssistantProvider(contribution.manifest)
    ? (contribution.providers.assistant as
        | PetrinautAssistantProvider
        | undefined)
    : undefined;

const extensionOf = (
  contribution: PetrinautPluginContribution,
): PetrinautAssistantExtension | undefined =>
  isAssistantExtension(contribution.manifest)
    ? (contribution.providers.assistant as
        | PetrinautAssistantExtension
        | undefined)
    : undefined;

const tabsOf = (
  contribution: PetrinautPluginContribution,
  tabs: readonly PetrinautAssistantTab[] | undefined,
): PetrinautResolvedAssistantTab[] =>
  (tabs ?? []).map((tab) => ({ ...tab, pluginId: contribution.manifest.id }));

/**
 * The active assistant's window content: the provider's chat configuration
 * with the fields its extensions add, and the provider's tabs followed by
 * theirs. `null` while no assistant is passed to the editor or the active one
 * has no chat for this document.
 */
export const useActiveAssistantContent =
  (): PetrinautActiveAssistant | null => {
    const contributions = usePetrinautPlugins();
    const { aiAssistantId } = use(UserSettingsContext);
    const activeId = resolveActiveAssistantId(
      contributions.map(({ manifest }) => manifest),
      aiAssistantId,
    );
    const active = contributions.find(
      ({ manifest }) => manifest.id === activeId,
    );
    const provider = active === undefined ? undefined : providerOf(active);
    if (
      active === undefined ||
      activeId === undefined ||
      !isAssistantProvider(active.manifest) ||
      provider?.chat === undefined ||
      provider.chat === null
    ) {
      return null;
    }
    const extensions = contributions.filter(
      ({ manifest }) =>
        isAssistantExtension(manifest) &&
        manifest.assistant.extends === activeId,
    );

    return {
      pluginId: activeId,
      label: active.manifest.assistant.label,
      chat: extensions.reduce<PetrinautAiAssistant>(
        (chat, extension) => ({ ...chat, ...extensionOf(extension)?.chat }),
        provider.chat,
      ),
      tabs: [
        ...tabsOf(active, provider.tabs),
        ...extensions.flatMap((extension) =>
          tabsOf(extension, extensionOf(extension)?.tabs),
        ),
      ],
    };
  };

/**
 * Whether the AI panel has an assistant to show. One boolean from context, so
 * the canvas and the controls that make room for the panel re-render only
 * when it changes, not on every chat update.
 */
export const useHasActiveAiAssistant = (): boolean =>
  use(AssistantPresenceContext);

/** The assistants passed to the editor and the active one, for the settings selector. */
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

/** A palette command for each assistant other than the active one, once two or more are passed. */
export const AssistantSwitchCommands = () => {
  const assistants = useInstalledAssistants();
  const active = useActiveAssistant();

  return assistants.length > 1
    ? assistants
        .filter(({ pluginId }) => pluginId !== active?.pluginId)
        .map((assistant) => (
          <AssistantSwitchCommand
            key={assistant.pluginId}
            assistant={assistant}
          />
        ))
    : null;
};
