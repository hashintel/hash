/** Canonical ChatAgent selection; retain the existing empty-string fallback. */
export const selectChatModel = (
  environment: NodeJS.ProcessEnv = process.env,
): string => environment.BRUNCH_CHAT_MODEL || "claude-haiku-4-5";
