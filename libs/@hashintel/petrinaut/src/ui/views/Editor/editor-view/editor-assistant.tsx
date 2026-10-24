import { use } from "react";

import { useCommand } from "../../../../react/commands/command-registry";
import { EditorContext } from "../../../../react/state/editor-context";
import {
  PluginAssistantContent,
  useAssistantChoice,
  usePluginAssistant,
} from "../../../plugins/plugin-assistant";
import { PluginAssistantPanel } from "../panels/assistant-panel-shell";

/** The editor's AI assistant: a running plugin's, chosen as `pickAssistant` does. */
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

const UseAssistantCommand = ({
  id,
  name,
  shown,
  choose,
}: {
  id: string;
  name: string;
  shown: boolean;
  choose: (pluginId: string) => void;
}) => {
  useCommand(
    {
      id: `petrinaut.ai-assistant.use.${id}`,
      label: `Use ${name} as the AI assistant`,
      category: "Editor",
      keywords: ["assistant", "ai", "chat", "switch"],
      run: () => choose(id),
    },
    { when: !shown },
  );

  return null;
};

/** A palette command for each assistant the editor does not show, which shows it. */
export const AssistantCommands = () => {
  const { assistants, shownId, choose } = useAssistantChoice();

  return assistants.map(({ id, name }) => (
    <UseAssistantCommand
      key={id}
      id={id}
      name={name}
      shown={id === shownId}
      choose={choose}
    />
  ));
};
