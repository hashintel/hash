import { use } from "react";

import { EditorContext } from "../../../../react/state/editor-context";
import {
  type AssistantStartRequest,
  PluginAssistantContent,
  usePluginAssistant,
} from "../../../plugins/plugin-assistant";
import { PluginAssistantPanel } from "../panels/assistant-panel-shell";

import type { PetrinautAiAssistant } from "../../../petrinaut";

/**
 * The editor's AI assistant: the first running plugin that provides one, or
 * else the `aiAssistant` prop's built-in chat.
 */
export const useEditorAssistant = (aiAssistant?: PetrinautAiAssistant) => {
  const plugin = usePluginAssistant();

  return {
    plugin,
    /** The built-in chat, while no plugin provides the assistant. */
    builtInChat: plugin === undefined ? aiAssistant : undefined,
    hasAssistant: plugin !== undefined || aiAssistant !== undefined,
    /** Takes the empty-net prompt's message for the plugin's assistant. */
    onPrompt: plugin?.contributions.assistant?.onPrompt,
    startAction: plugin?.contributions.assistant?.startAction,
  };
};

/**
 * The assistant panel beside the editor, around the plugin's content. The
 * content reads the panel's state and the empty-canvas prompt's start request
 * with `useAssistantPanel`.
 */
export const EditorAssistantPanel = ({
  plugin,
  petriNetId,
  focusRequest,
  startRequest,
  consumeStartRequest,
}: {
  plugin: NonNullable<ReturnType<typeof usePluginAssistant>>;
  petriNetId: string | null;
  focusRequest: number;
  startRequest: AssistantStartRequest | null;
  consumeStartRequest: () => void;
}) => {
  const {
    isAiAssistantOpen,
    isAiAssistantCollapsed,
    setAiAssistantCollapsed,
    setAiAssistantOpen,
  } = use(EditorContext);

  return (
    <PluginAssistantPanel
      panel={{
        isOpen: isAiAssistantOpen,
        close: () => setAiAssistantOpen(false),
        focusRequest,
        collapsed: isAiAssistantCollapsed,
        setCollapsed: setAiAssistantCollapsed,
        startRequest,
        consumeStartRequest,
      }}
    >
      <PluginAssistantContent
        /** A new net or a remounted plugin starts the content afresh. */
        key={`${plugin.instanceKey}:${petriNetId ?? "no-net"}`}
        pluginId={plugin.manifest.id}
      >
        {plugin.contributions.assistant?.content}
      </PluginAssistantContent>
    </PluginAssistantPanel>
  );
};
