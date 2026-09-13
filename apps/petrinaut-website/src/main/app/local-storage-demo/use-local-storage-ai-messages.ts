import { useCallback, useState } from "react";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const rootLocalStorageKey = "petrinaut-ai-messages";

type AiMessagesByNetId = Record<string, PetrinautAiMessage[]>;

const readMessages = (): AiMessagesByNetId => {
  const stored = localStorage.getItem(rootLocalStorageKey);
  if (stored === null) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as AiMessagesByNetId)
      : {};
  } catch {
    return {};
  }
};

export const useLocalStorageAiMessages = (input?: {
  readonly enabled: boolean;
}) => {
  const enabled = input?.enabled ?? true;
  const [state, setState] = useState(() => ({
    enabled,
    messages: enabled ? readMessages() : {},
  }));
  const aiMessagesByNetId =
    state.enabled === enabled ? state.messages : enabled ? readMessages() : {};
  if (state.enabled !== enabled)
    setState({ enabled, messages: aiMessagesByNetId });
  const setAiMessagesByNetId = useCallback(
    (
      update:
        | AiMessagesByNetId
        | ((previous: AiMessagesByNetId) => AiMessagesByNetId),
    ) => {
      if (!enabled) return;
      setState((previous) => {
        const current = previous.enabled ? previous.messages : readMessages();
        const next = typeof update === "function" ? update(current) : update;
        localStorage.setItem(rootLocalStorageKey, JSON.stringify(next));
        return { enabled: true, messages: next };
      });
    },
    [enabled],
  );
  return { aiMessagesByNetId, setAiMessagesByNetId };
};
