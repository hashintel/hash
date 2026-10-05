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

/** An assistant a running plugin provides. */
export interface InstalledAssistant {
  /** Id of the plugin whose manifest declares `assistant: { label }`. */
  readonly pluginId: string;
  /** Name in the assistant selector and the switch commands. */
  readonly label: string;
}

/** The assistants the running plugins provide, in dependency order. */
export const useInstalledAssistants = (): readonly InstalledAssistant[] =>
  usePetrinautPlugins().flatMap(({ manifest }) =>
    isAssistantProvider(manifest)
      ? [{ pluginId: manifest.id, label: manifest.assistant.label }]
      : [],
  );

/**
 * The assistant the editor shows, whether or not its chat is ready.
 * `undefined` while no running plugin provides one.
 */
export const useActiveAssistant = (): InstalledAssistant | undefined => {
  const assistants = useInstalledAssistants();
  const { aiAssistantId } = use(UserSettingsContext);
  const activeId = resolveActiveAssistantId(
    usePetrinautPlugins().map(({ manifest }) => manifest),
    aiAssistantId,
  );

  return assistants.find(({ pluginId }) => pluginId === activeId);
};

/** A tab of the assistant window, with the plugin that returned it. */
export interface PetrinautResolvedAssistantTab extends PetrinautAssistantTab {
  /** Id of the plugin that returned the tab; its failures are reported under it. */
  readonly pluginId: string;
}

/** What the assistant window shows: the active assistant with its extensions applied. */
export interface PetrinautActiveAssistant {
  /** Id of the plugin that provides the assistant. */
  readonly pluginId: string;
  /** Label from that plugin's manifest, as in the assistant selector. */
  readonly label: string;
  /**
   * The provider's chat configuration with each extension's `chat` fields
   * merged over it in dependency order, so a later extension wins.
   */
  readonly chat: PetrinautAiAssistant;
  /** The provider's tabs, then each extension's, in dependency order. */
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
 * What the assistant window of the nearest editor shows, extensions applied.
 * `null` while no running plugin provides an assistant or the active one
 * returns `chat: null`.
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

// One boolean from context, so the canvas and the controls that make room for
// the panel re-render only when it changes, not on every chat update.
/** Whether the active assistant has a chat for this document. */
export const useHasActiveAiAssistant = (): boolean =>
  use(AssistantPresenceContext);

/** The running assistants and the active one, for the selector in User settings. */
export const useAssistantChoice = () => {
  const assistants = useInstalledAssistants();
  const active = useActiveAssistant();
  const { setAiAssistantId } = use(UserSettingsContext);

  return {
    /** The running assistants as selector options, in dependency order. */
    assistants: assistants.map(({ pluginId, label }) => ({
      id: pluginId,
      label,
    })),
    /** Plugin id of the assistant the editor shows; `undefined` while none runs. */
    activeId: active?.pluginId,
    /** Records the user's pick by plugin id; `null` clears it. */
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

/** A palette command for each assistant but the active one, once two or more run. */
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
