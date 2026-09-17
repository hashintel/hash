import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

/**
 * Which assistant the demo's AI panel talks to.
 *
 * The stock assistant is Petrinaut's default; Brunch is the hidden alternate.
 * The choice is the host's: it is a browser-local preference of this website,
 * not a Petrinaut setting and not a server rollout. It only has
 * effect when a Brunch endpoint is configured — without one there is nothing
 * to select and the stock assistant is used regardless.
 */
export type AssistantSelection = "brunch" | "stock";

export const assistantSelectionStorageKey = "petrinaut-website:assistant";

export const resolveDefaultAssistantSelection = (
  configured: string | undefined,
): AssistantSelection => {
  const selection = configured?.trim();
  if (selection === undefined || selection === "") return "stock";
  if (selection === "brunch" || selection === "stock") return selection;
  throw new Error(
    `VITE_PETRINAUT_DEFAULT_ASSISTANT must be "stock" or "brunch", received ${JSON.stringify(configured)}.`,
  );
};

export const defaultAssistantSelection = resolveDefaultAssistantSelection(
  import.meta.env.VITE_PETRINAUT_DEFAULT_ASSISTANT,
);

/** Preserve an explicit choice; anything else reads as the configured default. */
export const parseAssistantSelection = (
  stored: string | null | undefined,
): AssistantSelection =>
  stored === "brunch" || stored === "stock"
    ? stored
    : defaultAssistantSelection;

/**
 * The stock assistant's own endpoint. It never moves with the Brunch endpoint:
 * with Brunch configured and the stock assistant selected, the panel still
 * talks to the stock backend and nothing else.
 */
export const stockChatEndpoint = "/api/chat";

const readAssistantSelection = (): AssistantSelection =>
  parseAssistantSelection(
    readBrowserStorage(localStorage, assistantSelectionStorageKey),
  );

const writeAssistantSelection = (selection: AssistantSelection): void =>
  writeBrowserStorage(localStorage, assistantSelectionStorageKey, selection);

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

export const useAssistantSelection = (input?: {
  readonly enabled: boolean;
}) => {
  const enabled = input?.enabled ?? true;
  const [selection, setSelection, ready] = usePersistedState({
    enabled,
    fallback: defaultAssistantSelection,
    read: readAssistantSelection,
    write: writeAssistantSelection,
  });
  return { ready, selection, setSelection };
};
