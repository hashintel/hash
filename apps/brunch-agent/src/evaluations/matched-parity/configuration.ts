import { resolve } from "node:path";

import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

export const matchedParityReasoning = "medium" as const;
export const paidAuthorizationValue = "I_AUTHORIZE_MATCHED_PAID_INFERENCE";

export interface MatchedParityConfiguration {
  readonly executePaid: boolean;
  readonly resumeCompleted: boolean;
  readonly maxTurnMs: number;
  readonly outputRoot: string;
  readonly provider: "openai";
  readonly stock: {
    readonly model: string;
    readonly reasoning: typeof matchedParityReasoning;
  };
  readonly brunch: {
    readonly model: `openai/${string}`;
    readonly reasoning: typeof matchedParityReasoning;
  };
}

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Matched parity evaluation requires ${name}.`);
  return value;
};

const positiveInteger = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error("MATCHED_PARITY_MAX_TURN_MS must be a positive integer.");
  return parsed;
};

/** Resolve and refuse unlike provider/model/reasoning settings before launch. */
export const resolveMatchedParityConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
  options: {
    readonly executePaid?: boolean;
    readonly resumeCompleted?: boolean;
  } = {},
): MatchedParityConfiguration => {
  const stockModel = required(environment, "PETRINAUT_AI_MODEL");
  const brunchModel = required(environment, "BRUNCH_CHAT_MODEL");
  const brunchThinking = required(environment, "BRUNCH_CHAT_THINKING");
  const expectedBrunchModel = `openai/${stockModel}`;
  if (brunchModel !== expectedBrunchModel)
    throw new Error(
      `Matched parity evaluation refused model mismatch: Stock openai/${stockModel}; Brunch ${brunchModel}.`,
    );
  if (brunchThinking !== matchedParityReasoning)
    throw new Error(
      `Matched parity evaluation refused reasoning mismatch: Stock ${matchedParityReasoning}; Brunch ${brunchThinking}.`,
    );
  if (
    !openaiProvider()
      .getModels()
      .some(({ id }) => id === stockModel)
  )
    throw new Error(
      `Matched parity evaluation refused unavailable Brunch OpenAI model ${stockModel}.`,
    );

  const executePaid = options.executePaid === true;
  if (
    executePaid &&
    environment.MATCHED_PARITY_PAID_AUTHORIZATION !== paidAuthorizationValue
  )
    throw new Error(
      `Paid execution requires MATCHED_PARITY_PAID_AUTHORIZATION=${paidAuthorizationValue}.`,
    );
  if (executePaid) required(environment, "OPENAI_API_KEY");

  return {
    executePaid,
    resumeCompleted: options.resumeCompleted === true,
    maxTurnMs: positiveInteger(
      environment.MATCHED_PARITY_MAX_TURN_MS,
      10 * 60_000,
    ),
    outputRoot: resolve(
      environment.MATCHED_PARITY_OUTPUT_ROOT ??
        `/tmp/petrinaut-matched-parity-${Date.now()}`,
    ),
    provider: "openai",
    stock: { model: stockModel, reasoning: matchedParityReasoning },
    brunch: {
      model: brunchModel as `openai/${string}`,
      reasoning: matchedParityReasoning,
    },
  };
};

export const evaluationEnvironment = (
  configuration: MatchedParityConfiguration,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({
  ...base,
  PETRINAUT_AI_MODEL: configuration.stock.model,
  BRUNCH_CHAT_MODEL: configuration.brunch.model,
  BRUNCH_CHAT_THINKING: configuration.brunch.reasoning,
  VITE_BRUNCH_CHAT_ENDPOINT: "/agents/chat",
  VITE_PETRINAUT_DEFAULT_ASSISTANT: "stock",
});
