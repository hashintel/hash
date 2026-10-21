import { useState } from "react";

import { voiceStartAction } from "./voice-start-action";

/** What the empty-net prompt asks the chat for: a first message, or Voice. */
export type AssistantChatStart =
  | { readonly text: string }
  | { readonly voice: true };

/**
 * Holds the empty-net prompt's message or Voice start until `AssistantChat`
 * takes it. A plugin returns `onPrompt` and `startAction` in its `assistant`,
 * and passes `start` and `onStartHandled` to `AssistantChat`.
 */
export const useAssistantChatStart = ({ voice }: { voice: boolean }) => {
  const [start, setStart] = useState<AssistantChatStart | null>(null);

  return {
    start,
    onStartHandled: () => setStart(null),
    onPrompt: (text: string) => setStart({ text }),
    startAction: voice
      ? { ...voiceStartAction, run: () => setStart({ voice: true }) }
      : undefined,
  };
};
