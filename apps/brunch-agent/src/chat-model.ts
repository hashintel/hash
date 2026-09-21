/** Bare Anthropic Sonnet id used by tests, legacy resume, and the persona default. */
export const STEP_A_MODEL_ID = "claude-sonnet-4-6";

export const PERSONA_DEFAULT_BRUNCH_MODEL = "openai/gpt-5.6-sol";
export const PERSONA_DEFAULT_BRUNCH_THINKING = "low";
export const PERSONA_DEFAULT_PERSONA_MODEL = `anthropic/${STEP_A_MODEL_ID}`;
export const PERSONA_DEFAULT_PERSONA_THINKING = "low";
export const LEGACY_PERSONA_THINKING = "medium";

const thinkingLevels = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ChatThinkingLevel = (typeof thinkingLevels)[number];

export const isChatThinkingLevel = (
  value: string,
): value is ChatThinkingLevel =>
  thinkingLevels.some((level) => level === value);

/** Canonical ChatAgent selection; retain the existing empty-string fallback. */
export const selectChatModel = (
  environment: NodeJS.ProcessEnv = process.env,
): string => environment.BRUNCH_CHAT_MODEL || "claude-haiku-4-5";

/** Full `provider/id` specifier. Bare ids stay Anthropic so existing tests keep working. */
export const selectChatModelSpecifier = (
  environment: NodeJS.ProcessEnv = process.env,
): string => {
  const selected = environment.BRUNCH_CHAT_MODEL;
  return selected?.includes("/")
    ? selected
    : `anthropic/${selectChatModel(environment)}`;
};

/** Persona launches set this; ordinary ChatAgent leaves thinking unset (Flue medium). */
export const selectChatThinking = (
  environment: NodeJS.ProcessEnv = process.env,
): ChatThinkingLevel | undefined => {
  const value = environment.BRUNCH_CHAT_THINKING;
  if (!value) return undefined;
  if (!isChatThinkingLevel(value))
    throw new Error("Unsupported BRUNCH_CHAT_THINKING");
  return value;
};
