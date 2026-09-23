/**
 * Which assistant the demo offers first. Petrinaut keeps the user's choice
 * in User settings once one is made; until then the first installed
 * assistant is active, and this decides the order. It only matters where a
 * Brunch endpoint is configured — without one the stock assistant is the
 * only one.
 */
export type AssistantSelection = "brunch" | "stock";

/**
 * This site's earlier browser-local choice, from before the choice moved to
 * Petrinaut's User settings. Read, never written: it orders the assistants
 * until the user chooses again.
 */
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
