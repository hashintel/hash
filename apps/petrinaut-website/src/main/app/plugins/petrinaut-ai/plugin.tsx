import { DefaultChatTransport } from "ai";

import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import { VOICE_REQUEST_ID_HEADER } from "../../../../voice-diagnostics";
import { stockChatEndpoint } from "../../local-storage-demo/assistant-selection";
import { AssistantChat } from "../_shared/chat/assistant-chat";
import { useAssistantChatStart } from "../_shared/chat/assistant-chat-start";
import { useLocalStorageAiMessages } from "./plugin/use-local-storage-ai-messages";

import type { PetrinautAiMessage } from "../_shared/chat/ai-message";

const PetrinautAiPlugin = definePetrinautPlugin({
  id: "website.petrinaut-ai",
  name: "Petrinaut AI",
  description:
    "Petrinaut's own assistant, with the transcript saved per document in this browser.",
  author: "HASH",
  access: { document: "write", experiments: "write", editor: "write" },
  assistant: true,
});

/** One transport serves every document; `headers` runs per request. */
const transport = new DefaultChatTransport<PetrinautAiMessage>({
  api: stockChatEndpoint,
  headers: () => ({ [VOICE_REQUEST_ID_HEADER]: crypto.randomUUID() }),
});

const usePetrinautAiPlugin: PluginHook<typeof PetrinautAiPlugin> = (api) => {
  const [messages, setMessages] = useLocalStorageAiMessages(api.document.id);
  const chatStart = useAssistantChatStart({ voice: false });

  return {
    assistant: {
      content: (
        <AssistantChat
          api={api}
          canClearMessages
          transport={transport}
          messages={messages}
          onMessages={setMessages}
          onClearMessages={() => setMessages(undefined)}
          start={chatStart.start}
          onStartHandled={chatStart.onStartHandled}
        />
      ),
      onPrompt: chatStart.onPrompt,
    },
  };
};

/** Petrinaut's own assistant, with each document's transcript saved in this browser. */
export const petrinautAiPlugin = PetrinautAiPlugin(usePetrinautAiPlugin);
