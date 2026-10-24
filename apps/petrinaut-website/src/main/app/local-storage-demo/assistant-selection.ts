import { readBrowserStorage } from "./browser-storage";

/**
 * Which assistant the demo offers first. Petrinaut shows the first assistant
 * plugin until the user chooses one in its settings, so this choice orders
 * the two: the one saved in this browser, else the deployment's default.
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
 * with Brunch configured and the stock assistant shown, the panel still talks
 * to the stock backend and nothing else.
 */
export const stockChatEndpoint = "/api/chat";

export const readAssistantSelection = (): AssistantSelection =>
  parseAssistantSelection(
    readBrowserStorage(localStorage, assistantSelectionStorageKey),
  );
