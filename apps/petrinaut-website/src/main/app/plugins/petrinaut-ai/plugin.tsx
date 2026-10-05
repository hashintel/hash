/**
 * Petrinaut AI, Petrinaut's own assistant, as a plugin: one chat transport
 * to the website's own route, with the transcript kept per document in local
 * storage. Selecting it never routes anything through Brunch.
 */

import { useState } from "react";

import {
  DefaultChatTransport,
  definePetrinautPlugin,
  definePluginManifest,
  type PetrinautAiMessage,
} from "@hashintel/petrinaut/ui";

import { VOICE_REQUEST_ID_HEADER } from "../../../../voice-diagnostics";
import { useLocalStorageAiMessages } from "./plugin/use-local-storage-ai-messages";

export const petrinautAiManifest = definePluginManifest({
  id: "website.petrinaut-ai",
  name: "Petrinaut AI",
  description:
    "Petrinaut's own assistant over the website's chat route, with the transcript saved per document in this browser.",
  author: "HASH",
  assistant: { label: "Petrinaut" },
});
export type PetrinautAiManifest = typeof petrinautAiManifest;

/** Petrinaut AI's own endpoint; it never moves with the Brunch endpoint. */
export const petrinautAiChatEndpoint = "/api/chat";

export const petrinautAiPlugin = definePetrinautPlugin(
  petrinautAiManifest,
  (api) => {
    const [transport] = useState(
      () =>
        new DefaultChatTransport<PetrinautAiMessage>({
          api: petrinautAiChatEndpoint,
          headers: () => ({ [VOICE_REQUEST_ID_HEADER]: crypto.randomUUID() }),
        }),
    );
    const [messages, setMessages] = useLocalStorageAiMessages(api.document.id);

    return {
      assistant: {
        chat: {
          transport,
          canClearMessages: true,
          messages,
          onMessages: setMessages,
          onClearMessages: () => setMessages(undefined),
        },
      },
    };
  },
);
