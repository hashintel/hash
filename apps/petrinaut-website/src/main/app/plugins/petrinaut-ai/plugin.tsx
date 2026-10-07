import { DefaultChatTransport } from "ai";

import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui";

import { VOICE_REQUEST_ID_HEADER } from "../../../../voice-diagnostics";
import { AssistantChat } from "../_shared/chat/assistant-chat";
import { useLocalStorageAiMessages } from "./plugin/use-local-storage-ai-messages";

import type { PetrinautAiMessage } from "../_shared/chat/ai-message";

const createPetrinautAiPlugin = definePetrinautPlugin({
  id: "website.petrinaut-ai",
  name: "Petrinaut AI",
  description:
    "Petrinaut's own assistant, with the transcript saved per document in this browser.",
  author: "HASH",
  access: { document: "write", experiments: "write" },
  assistant: { label: "Petrinaut" },
});

/** One transport serves every document; `headers` runs per request. */
const transport = new DefaultChatTransport<PetrinautAiMessage>({
  api: "/api/chat",
  headers: () => ({ [VOICE_REQUEST_ID_HEADER]: crypto.randomUUID() }),
});

const usePetrinautAiPlugin: PluginHook<typeof createPetrinautAiPlugin> = (
  api,
) => {
  const [messages, setMessages] = useLocalStorageAiMessages(api.document.id);

  return {
    assistant: {
      view: (
        <AssistantChat
          api={api}
          transport={transport}
          messages={messages}
          onMessages={setMessages}
          onClearMessages={() => setMessages(undefined)}
        />
      ),
    },
  };
};

/** Petrinaut's own assistant, with each document's transcript saved in this browser. */
export const petrinautAiPlugin = createPetrinautAiPlugin(usePetrinautAiPlugin);
