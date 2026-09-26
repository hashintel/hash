import {
  createModels,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

import {
  isChatThinkingLevel,
  LEGACY_PERSONA_THINKING,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_THINKING,
  STEP_A_MODEL_ID,
  type ChatThinkingLevel,
} from "../../../chat-model.ts";
import { openaiProviderWithGpt6 } from "../../../openai-provider.ts";

/** Brunch's own model; the persona agent chooses its model through its harness. */
export type PersonaRoleSettings = {
  brunchModel: string;
  brunchThinking: ChatThinkingLevel;
};

const catalog = () => {
  const models = createModels();
  models.setProvider(anthropicProvider());
  models.setProvider(openaiProviderWithGpt6());
  return models;
};

const parseModelSpecifier = (value: string) => {
  const trimmed = value.trim();
  const index = trimmed.indexOf("/");
  if (index <= 0 || index >= trimmed.length - 1)
    throw new Error("Role model must be a provider/id specifier");
  return { provider: trimmed.slice(0, index), id: trimmed.slice(index + 1) };
};

const resolveRoleSelection = (specifier: string, thinking: string) => {
  const { provider, id } = parseModelSpecifier(specifier);
  const model = catalog().getModel(provider, id);
  if (!model) throw new Error(`Unknown model specifier ${provider}/${id}`);
  if (
    !isChatThinkingLevel(thinking) ||
    !getSupportedThinkingLevels(model).includes(thinking)
  )
    throw new Error(`Unsupported thinking ${thinking} for ${provider}/${id}`);
  return {
    specifier: `${model.provider}/${model.id}`,
    thinking,
  };
};

export const resolvePersonaRoleSettings = (
  input: {
    brunchModel?: string;
    brunchThinking?: string;
  } = {},
): PersonaRoleSettings => {
  const brunch = resolveRoleSelection(
    input.brunchModel ?? DEFAULT_CHAT_MODEL,
    input.brunchThinking ?? DEFAULT_CHAT_THINKING,
  );
  return { brunchModel: brunch.specifier, brunchThinking: brunch.thinking };
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const roleSettingsFromRun = (config: unknown): PersonaRoleSettings => {
  if (!record(config)) throw new Error("Persona run is missing role settings");
  if (
    typeof config.brunchModel === "string" &&
    typeof config.brunchThinking === "string"
  ) {
    if (!isChatThinkingLevel(config.brunchThinking))
      throw new Error("Persona run has an unsupported thinking level");
    return {
      brunchModel: config.brunchModel,
      brunchThinking: config.brunchThinking,
    };
  }
  if (config.model === STEP_A_MODEL_ID) {
    return {
      brunchModel: `anthropic/${STEP_A_MODEL_ID}`,
      brunchThinking: LEGACY_PERSONA_THINKING,
    };
  }
  throw new Error("Persona run is missing role model settings");
};
