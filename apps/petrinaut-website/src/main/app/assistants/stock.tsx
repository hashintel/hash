/**
 * The stock Petrinaut assistant as a plugin: one chat transport to the
 * website's own route, with the transcript kept per document in local
 * storage. Selecting it never routes anything through Brunch.
 */

import { useLayoutEffect, useMemo } from "react";

import { createReadableStore } from "@hashintel/petrinaut-core";
import { useStore } from "@hashintel/petrinaut/react";
import {
  DefaultChatTransport,
  definePetrinautPlugin,
  type PetrinautAiAssistant,
  type PetrinautAiMessage,
  type PetrinautPluginApi,
} from "@hashintel/petrinaut/ui";

import { VOICE_REQUEST_ID_HEADER } from "../../../voice-diagnostics";
import { useLocalStorageAiMessages } from "./stock/use-local-storage-ai-messages";

const stockManifest = {
  id: "website.stock",
  name: "Petrinaut assistant",
  assistant: { label: "Petrinaut" },
} as const;

type StockApi = PetrinautPluginApi<typeof stockManifest>;

/** The stock assistant's own endpoint; it never moves with the Brunch endpoint. */
export const stockChatEndpoint = "/api/chat";

/**
 * Publishes the chat configuration for the open document: the shared
 * transport plus that document's saved transcript.
 */
const StockRoot = ({
  api,
  transport,
  publish,
}: {
  api: StockApi;
  transport: DefaultChatTransport<PetrinautAiMessage>;
  publish: (chat: PetrinautAiAssistant | null) => void;
}) => {
  const document = useStore(api.document);
  const documentId = document?.id ?? null;
  const { aiMessagesByNetId, setAiMessagesByNetId } =
    useLocalStorageAiMessages();
  const chat = useMemo<PetrinautAiAssistant | null>(() => {
    if (documentId === null) return null;
    return {
      transport,
      canClearMessages: true,
      messages: aiMessagesByNetId[documentId],
      onMessages: (messages) =>
        setAiMessagesByNetId((previous) => ({
          ...previous,
          [documentId]: messages,
        })),
      onClearMessages: () =>
        setAiMessagesByNetId((previous) => {
          const next = { ...previous };
          delete next[documentId];
          return next;
        }),
    };
  }, [aiMessagesByNetId, documentId, setAiMessagesByNetId, transport]);
  useLayoutEffect(() => {
    publish(chat);
  }, [publish, chat]);
  return null;
};

export const createStockPlugin = () =>
  definePetrinautPlugin(stockManifest, (api) => {
    const chat = createReadableStore<PetrinautAiAssistant | null>(null);
    const transport = new DefaultChatTransport<PetrinautAiMessage>({
      api: stockChatEndpoint,
      headers: () => ({ [VOICE_REQUEST_ID_HEADER]: crypto.randomUUID() }),
    });
    return {
      root: () => (
        <StockRoot
          api={api}
          transport={transport}
          publish={(next) => chat.set(next)}
        />
      ),
      assistant: { chat },
    };
  });
