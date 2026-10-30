import { use } from "react";

import { EditorContext } from "../../../../react/state/editor-context";
import {
  PluginAssistantContent,
  usePluginAssistant,
} from "../../../plugins/plugin-assistant";
import { PluginAssistantPanel } from "../panels/assistant-panel-shell";

/** The editor's AI assistant: the first running plugin that provides one. */
export const useEditorAssistant = () => {
  const plugin = usePluginAssistant();

  return {
    plugin,
    hasAssistant: plugin !== undefined,
    /** Takes the empty-net prompt's message for the plugin's assistant. */
    onPrompt: plugin?.contributions.assistant?.onPrompt,
  };
};

/** The assistant panel beside the editor, around the plugin's content. */
export const EditorAssistantPanel = ({
  plugin,
  petriNetId,
  focusRequest,
}: {
  plugin: NonNullable<ReturnType<typeof usePluginAssistant>>;
  petriNetId: string | null;
  focusRequest: number;
}) => {
  const { isAiAssistantOpen, setAiAssistantOpen } = use(EditorContext);

  return (
    <PluginAssistantPanel
      panel={{
        isOpen: isAiAssistantOpen,
        close: () => setAiAssistantOpen(false),
      }}
      focusRequest={focusRequest}
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
