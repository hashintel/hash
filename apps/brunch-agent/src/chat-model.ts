/** The exact Step A model MISSION.md pins for both ChatAgent and persona; never a fallback. */
export const STEP_A_MODEL_ID = "claude-sonnet-4-6";

/** Canonical ChatAgent selection; retain the existing empty-string fallback. */
export const selectChatModel = (
  environment: NodeJS.ProcessEnv = process.env,
): string => environment.BRUNCH_CHAT_MODEL || "claude-haiku-4-5";
