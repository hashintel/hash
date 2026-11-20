import { useCommand } from "../../../../react/commands/command-registry";
import { useDocumentId } from "../../../../react/hooks/use-document";
import {
  useEditorActions,
  useEditorState,
} from "../../../../react/state/editor-context";
import {
  PluginAssistantContent,
  useAssistantChoice,
  usePluginAssistant,
} from "../../../plugins/plugin-assistant";
import { PluginAssistantPanel } from "../panels/assistant-panel-shell";

/**
 * The assistant panel beside the editor, around the content of the plugin
 * whose assistant the editor shows. Nothing while no plugin provides one.
 */
export const EditorAssistantPanel = () => {
  const plugin = usePluginAssistant();
  const petriNetId = useDocumentId();
  const isAiAssistantOpen = useEditorState(
    (editor) => editor.isAiAssistantOpen,
  );
  const { setAiAssistantOpen } = useEditorActions();

  if (plugin === undefined) {
    return null;
  }

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
