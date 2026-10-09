import { createContext, use } from "react";

import type { AccessApi } from "@hashintel/petrinaut/ui";

/** What the chat reads and changes in the editor: the document and its experiments. */
export type AssistantChatApi = AccessApi<{
  document: "write";
  experiments: "write";
}>;

/** The chat's `api`, for the components it renders. */
export const AssistantChatApiContext = createContext<AssistantChatApi | null>(
  null,
);

/** The `api` of the chat around the calling component. */
export const useAssistantChatApi = (): AssistantChatApi => {
  const api = use(AssistantChatApiContext);
  if (api === null) {
    throw new Error("Chat components must render inside AssistantChat.");
  }

  return api;
};
