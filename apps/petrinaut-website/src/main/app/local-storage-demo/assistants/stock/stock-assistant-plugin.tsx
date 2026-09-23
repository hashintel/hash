import { useMemo } from "react";

import {
  DefaultChatTransport,
  definePetrinautPlugin,
  type PetrinautAiAssistant,
  type PetrinautAiMessage,
  usePetrinautAiAssistant,
} from "@hashintel/petrinaut/ui";

import { VOICE_REQUEST_ID_HEADER } from "../../../../../voice-diagnostics";
import { stockChatEndpoint } from "../../assistant-selection";
import { useDemoAssistantHost } from "../demo-assistant-host";

export const stockAssistantId = "website.stock-assistant";

// The stock assistant's transport is the same whether or not Brunch is
// configured: selecting the stock assistant must not route it through Brunch.
const stockChatTransport = new DefaultChatTransport({
  api: stockChatEndpoint,
  headers: () => ({
    [VOICE_REQUEST_ID_HEADER]: crypto.randomUUID(),
  }),
});

/** Petrinaut's own assistant, with its history kept per net in local storage. */
const StockAssistant = () => {
  const { document, stockMessages } = useDemoAssistantHost();
  const netId = document.documentId;
  const { byNetId, setByNetId } = stockMessages;
  const assistant = useMemo<PetrinautAiAssistant>(
    () => ({
      canClearMessages: true,
      automaticTools: [],
      interactiveTools: [],
      transport: stockChatTransport,
      messages: byNetId[netId],
      onMessages: (messages: PetrinautAiMessage[]) =>
        setByNetId((previous) => ({ ...previous, [netId]: messages })),
      onClearMessages: () =>
        setByNetId((previous) => {
          const next = { ...previous };
          delete next[netId];
          return next;
        }),
    }),
    [byNetId, netId, setByNetId],
  );
  usePetrinautAiAssistant(assistant);
  return null;
};

export const stockAssistantPlugin = definePetrinautPlugin({
  id: stockAssistantId,
  name: "Stock Petrinaut assistant",
  assistants: [
    { id: stockAssistantId, label: "Petrinaut", component: StockAssistant },
  ],
});
