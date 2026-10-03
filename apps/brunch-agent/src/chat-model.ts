import { brunchEnv } from "@hashintel/brunch-agent";

/** Bare Anthropic Sonnet id used by tests and legacy resume. */
export const STEP_A_MODEL_ID = "claude-sonnet-4-6";

/** Brunch's default model and thinking level unless `BRUNCH_CHAT_MODEL` overrides them. */
export const DEFAULT_CHAT_MODEL = "openai/gpt-5.5-2026-04-23";
export const DEFAULT_CHAT_THINKING = "medium";
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

/** Full `provider/id` specifier. Bare ids stay Anthropic so existing tests keep working. */
export const selectChatModelSpecifier = (
  environment: NodeJS.ProcessEnv = process.env,
): string => {
  const selected = environment[brunchEnv.chatModel];
  if (!selected) return DEFAULT_CHAT_MODEL;
  return selected.includes("/") ? selected : `anthropic/${selected}`;
};

/** The default thinking level belongs to the default model; an overriding model gets none unless one is set. */
export const selectChatThinking = (
  environment: NodeJS.ProcessEnv = process.env,
): ChatThinkingLevel | undefined => {
  const value = environment[brunchEnv.chatThinking];
  if (!value)
    return environment[brunchEnv.chatModel] ? undefined : DEFAULT_CHAT_THINKING;
  if (!isChatThinkingLevel(value))
    throw new Error(`Unsupported ${brunchEnv.chatThinking}`);
  return value;
};
