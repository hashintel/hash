import { useCommand } from "../../../../react/commands/command-registry";
import {
  useEditorActions,
  useEditorState,
} from "../../../../react/state/editor-context";
import {
  PluginAssistantContent,
  useAssistantChoice,
} from "../../../plugins/plugin-assistant";
import { PluginAssistantPanel } from "../panels/assistant-panel-shell";

import type { RunningPlugin } from "../../../plugins/plugins-provider";

/** The assistant panel beside the editor, around the plugin's content. */
export const EditorAssistantPanel = ({
  plugin,
  petriNetId,
}: {
  plugin: RunningPlugin;
  petriNetId: string | null;
}) => {
  const isAiAssistantOpen = useEditorState(
    (editor) => editor.isAiAssistantOpen,
  );
  const { setAiAssistantOpen } = useEditorActions();

  return (
    <PluginAssistantPanel
      panel={{
        isOpen: isAiAssistantOpen,
        close: () => setAiAssistantOpen(false),
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
