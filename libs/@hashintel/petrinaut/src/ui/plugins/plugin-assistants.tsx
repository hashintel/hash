import {
  createContext,
  type ReactNode,
  use,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { useCommand } from "../../react/commands/command-registry";
import {
  createValueStore,
  type ValueStore,
} from "../../react/create-value-store";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { useInstalledPlugins } from "./installed-plugins";
import {
  definePetrinautPlugin,
  type PetrinautPluginAssistant,
  type PetrinautPluginAssistantEntry,
  resolveActiveAssistant,
  selectPluginAssistants,
} from "./plugin";
import { PluginContributionBoundary } from "./plugin-boundary";

import type { PetrinautAiAssistant } from "../petrinaut";

type PublishedAssistant = { id: string; assistant: PetrinautAiAssistant };

type AssistantsContextValue = {
  /** Holds what the active assistant's component last passed. */
  store: ValueStore<PublishedAssistant | null>;
  entries: readonly PetrinautPluginAssistantEntry[];
  active: PetrinautPluginAssistant | undefined;
};

const AssistantsContext = createContext<AssistantsContextValue>({
  store: createValueStore<PublishedAssistant | null>(null),
  entries: [],
  active: undefined,
});

/** What the mounted assistant component publishes into, under its own id. */
const AssistantSlotContext = createContext<{
  store: ValueStore<PublishedAssistant | null>;
  id: string;
} | null>(null);

/**
 * Passes the assistant a `PetrinautPluginAssistant.component` builds to the
 * editor's AI panel. `null` means not ready yet, and hides the panel. Outside
 * an assistant component it does nothing.
 *
 * The panel creates its chat once per assistant and document, so a new
 * `transport` reaches only the next conversation; everything else the
 * assistant carries applies on the next render.
 */
export const usePetrinautAiAssistant = (
  assistant: PetrinautAiAssistant | null,
): void => {
  const slot = use(AssistantSlotContext);
  useLayoutEffect(() => {
    slot?.store.set(assistant === null ? null : { id: slot.id, assistant });
  }, [slot, assistant]);
  useLayoutEffect(() => {
    if (slot === null) {
      return;
    }
    return () => {
      if (slot.store.getSnapshot()?.id === slot.id) {
        slot.store.set(null);
      }
    };
  }, [slot]);
};

export type ActiveAiAssistant = {
  id: string;
  label: string;
  assistant: PetrinautAiAssistant;
};

/**
 * The assistant the AI panel shows: the active plugin assistant, once its
 * component has passed a value. `null` hides the panel and every AI entry
 * point.
 */
export const useActiveAiAssistant = (): ActiveAiAssistant | null => {
  const { store, active } = use(AssistantsContext);
  const published = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return active !== undefined && published?.id === active.id
    ? { id: active.id, label: active.label, assistant: published.assistant }
    : null;
};

/**
 * The id of the assistant the user has active, before its component has
 * passed a value, or `undefined` when none is installed. For a plugin's other
 * contributions, such as a settings group that applies only to its own
 * assistant.
 */
export const usePetrinautActiveAssistantId = (): string | undefined =>
  use(AssistantsContext).active?.id;

/** The installed assistants and the active one, for the settings selector. */
export const useAssistantChoice = () => {
  const { entries, active } = use(AssistantsContext);
  const { setAiAssistantId } = use(UserSettingsContext);
  return {
    assistants: entries.map(({ assistant }) => assistant),
    activeId: active?.id,
    choose: setAiAssistantId,
  };
};

const AssistantSwitchCommand = ({
  assistant,
}: {
  assistant: PetrinautPluginAssistant;
}) => {
  const { setAiAssistantId } = use(UserSettingsContext);
  useCommand({
    id: `petrinaut.ai-assistant.use:${assistant.id}`,
    label: `Use the ${assistant.label} assistant`,
    category: "Editor",
    keywords: ["assistant", "ai", "switch", assistant.label],
    run: () => setAiAssistantId(assistant.id),
  });
  return null;
};

/**
 * Resolves the active assistant for one editor and mounts its component
 * beside the editor. The component publishes into a store rather than
 * wrapping the editor, so switching assistants or a failing one never
 * remounts the editor, and a publish re-renders only the store's readers.
 */
export const PluginAssistants = ({ children }: { children: ReactNode }) => {
  const [store] = useState(() =>
    createValueStore<PublishedAssistant | null>(null),
  );
  const entries = selectPluginAssistants(useInstalledPlugins());
  const { aiAssistantId } = use(UserSettingsContext);
  const active = resolveActiveAssistant(entries, aiAssistantId);
  const Assistant = active?.assistant.component;

  return (
    <AssistantsContext value={{ store, entries, active: active?.assistant }}>
      {children}
      {active !== undefined && Assistant !== undefined && (
        <PluginContributionBoundary
          key={active.assistant.id}
          pluginId={active.pluginId}
          contributionId={active.assistant.id}
          place="assistant"
        >
          <AssistantSlotContext value={{ store, id: active.assistant.id }}>
            <Assistant />
          </AssistantSlotContext>
        </PluginContributionBoundary>
      )}
      {entries.length > 1 &&
        entries
          .filter(({ assistant }) => assistant.id !== active?.assistant.id)
          .map(({ assistant }) => (
            <AssistantSwitchCommand key={assistant.id} assistant={assistant} />
          ))}
    </AssistantsContext>
  );
};

/** The deprecated `aiAssistant` prop, read by the plugin that stands in for it. */
export const HostAiAssistantContext = createContext<
  PetrinautAiAssistant | undefined
>(undefined);

const HostAiAssistant = () => {
  usePetrinautAiAssistant(use(HostAiAssistantContext) ?? null);
  return null;
};

/**
 * Installed while a host passes the deprecated `aiAssistant` prop, ahead of
 * every plugin, so that assistant stays the default.
 */
export const hostAiAssistantPlugin = definePetrinautPlugin({
  id: "petrinaut.host-ai-assistant",
  name: "AI assistant from the aiAssistant prop",
  assistants: [
    {
      id: "petrinaut.host-ai-assistant",
      label: "AI",
      component: HostAiAssistant,
    },
  ],
});
