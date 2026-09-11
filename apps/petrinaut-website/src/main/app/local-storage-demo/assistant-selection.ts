import { useLocalStorage } from "@mantine/hooks";

/**
 * Which assistant the demo's AI panel talks to.
 *
 * Brunch is Petrinaut's default assistant; the stock assistant is the
 * alternate. The choice is the host's: it is a browser-local preference of
 * this website, not a Petrinaut setting and not a server rollout. It only has
 * effect when a Brunch endpoint is configured — without one there is nothing
 * to select and the stock assistant is used regardless.
 */
export type AssistantSelection = "brunch" | "stock";

export const assistantSelectionStorageKey = "petrinaut-website:assistant";

export const defaultAssistantSelection: AssistantSelection = "brunch";

/** Anything but an explicit `"stock"` reads as the default. */
export const parseAssistantSelection = (
  stored: string | null | undefined,
): AssistantSelection => (stored === "stock" ? "stock" : "brunch");

/**
 * The stock assistant's own endpoint. It never moves with the Brunch endpoint:
 * with Brunch configured and the stock assistant selected, the panel still
 * talks to the stock backend and nothing else.
 */
export const stockChatEndpoint = "/api/chat";

/**
 * Whether Brunch is the assistant in use: configured and selected. Everything
 * Brunch-specific in the host keys off this, so with the stock assistant
 * selected no Flue client is created, no Brunch tools are mounted, and no
 * Brunch history is read or written.
 */
export const isBrunchSelected = (
  isBrunchConfigured: boolean,
  selection: AssistantSelection,
): boolean => isBrunchConfigured && selection === "brunch";

export const useAssistantSelection = () => {
  const [selection, setSelection] = useLocalStorage<AssistantSelection>({
    key: assistantSelectionStorageKey,
    defaultValue: defaultAssistantSelection,
    getInitialValueInEffect: false,
    serialize: (value) => value,
    deserialize: parseAssistantSelection,
  });
  return { selection, setSelection };
};
