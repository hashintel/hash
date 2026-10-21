import { DefaultChatTransport } from "ai";

import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import { VOICE_REQUEST_ID_HEADER } from "../../../../voice-diagnostics";
import { stockChatEndpoint } from "../../local-storage-demo/assistant-selection";
import { AssistantChat } from "./chat/assistant-chat";
import { useAssistantChatStart } from "./chat/assistant-chat-start";
import { useLocalStorageAiMessages } from "./plugin/use-local-storage-ai-messages";

import type { PetrinautAiMessage } from "./chat/ai-message";

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
  const chatStart = useAssistantChatStart();

  return {
    assistant: {
      content: (
        <AssistantChat
          api={api}
          transport={transport}
          messages={messages}
          // Clear reports no messages, which removes the saved transcript.
          onMessages={(next) => setMessages(next.length > 0 ? next : undefined)}
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
