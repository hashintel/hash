import { useState } from "react";

/** The empty-net prompt's message, for the chat to send first. */
export type AssistantChatStart = { readonly text: string };

/**
 * Holds the empty-net prompt's message until `AssistantChat` takes it. A
 * plugin returns `onPrompt` in its `assistant`, and passes `start` and
 * `onStartHandled` to `AssistantChat`.
 */
export const useAssistantChatStart = () => {
  const [start, setStart] = useState<AssistantChatStart | null>(null);

  return {
    start,
    onStartHandled: () => setStart(null),
    onPrompt: (text: string) => setStart({ text }),
  };
};
