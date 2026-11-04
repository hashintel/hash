import { createContext, use } from "react";

import type { AccessApi } from "@hashintel/petrinaut/ui/plugin";

/** What Brunch's chat reads and changes in the editor, through its plugin. */
export type AiAssistantEditorApi = AccessApi<{
  document: "write";
  experiments: "write";
  editor: "write";
}>;

/** The plugin `api` for the chat's components, set by `AiAssistantPanel`. */
export const AiAssistantEditorApiContext =
  createContext<AiAssistantEditorApi | null>(null);

/** The plugin `api` of the chat around the calling component. */
export const useAiAssistantEditorApi = (): AiAssistantEditorApi => {
  const api = use(AiAssistantEditorApiContext);
  if (api === null) {
    throw new Error("Chat components must render inside AiAssistantPanel.");
  }

  return api;
};
