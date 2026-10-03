import { createContext, use, useLayoutEffect } from "react";

import {
  definePetrinautPlugin,
  type PetrinautAiAssistant,
} from "@hashintel/petrinaut";
import { createReadableStore } from "@hashintel/petrinaut-core";

/**
 * The assistant configuration the page builds from the host bridge: the
 * transport and the conversation the host persists. Provided above the
 * editor so the plugin stays a stable module constant.
 */
export const EmbedAssistantContext = createContext<PetrinautAiAssistant | null>(
  null,
);

/** HASH's assistant for the process embed, over the iframe bridge transport. */
export const embedAssistantPlugin = definePetrinautPlugin(
  {
    id: "hash.process-embed-assistant",
    name: "HASH assistant",
    assistant: { label: "AI" },
  },
  () => {
    const chat = createReadableStore<PetrinautAiAssistant | null>(null);
    // Publishes the page's current configuration into the store the window reads.
    const Root = () => {
      const assistant = use(EmbedAssistantContext);
      useLayoutEffect(() => {
        chat.set(assistant);
      }, [assistant]);
      return null;
    };
    return { root: Root, assistant: { chat } };
  },
);
