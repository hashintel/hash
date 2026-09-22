import { resolve } from "node:path";

import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

export const matchedParityReasoning = "medium" as const;
export const matchedParityArms = ["S", "F", "I", "A", "B"] as const;
export type EvaluationArm = (typeof matchedParityArms)[number];
export type BrunchEvaluationMode = Exclude<EvaluationArm, "S">;

export interface MatchedParityArmConfiguration {
  readonly assistant: "stock" | "brunch";
  readonly label: string;
  readonly model: string;
  readonly reasoning: typeof matchedParityReasoning;
  readonly websiteMode: BrunchEvaluationMode | null;
}

export interface MatchedParityConfiguration {
  readonly arms: Readonly<Record<EvaluationArm, MatchedParityArmConfiguration>>;
  readonly budgetUsd: number;
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

const positiveNumber = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error("MATCHED_PARITY_BUDGET_USD must be a positive number.");
  return parsed;
};

/** Resolve and refuse unlike provider/model/reasoning settings before launch. */
export const resolveMatchedParityConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
  options: {
    readonly budgetUsd?: number;
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
  if (executePaid) required(environment, "OPENAI_API_KEY");
  const budgetUsd = positiveNumber(
    options.budgetUsd === undefined
      ? environment.MATCHED_PARITY_BUDGET_USD
      : String(options.budgetUsd),
    50,
  );
  const stock = {
    model: stockModel,
    reasoning: matchedParityReasoning,
  } as const;
  const brunch = {
    model: brunchModel as `openai/${string}`,
    reasoning: matchedParityReasoning,
  } as const;
  const integrated = {
    assistant: "brunch",
    label: "Integrated Brunch canonical",
    model: brunch.model,
    reasoning: brunch.reasoning,
    websiteMode: "I",
  } as const;

  return {
    arms: {
      S: {
        assistant: "stock",
        label: "Native Stock",
        model: stock.model,
        reasoning: stock.reasoning,
        websiteMode: null,
      },
      F: {
        assistant: "brunch",
        label: "Stock over Flue",
        model: brunch.model,
        reasoning: brunch.reasoning,
        websiteMode: "F",
      },
      I: integrated,
      A: {
        ...integrated,
        label: "Declared projection",
        websiteMode: "A",
      },
      B: {
        ...integrated,
        label: "Deep construction",
        websiteMode: "B",
      },
    },
    budgetUsd,
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
    stock,
    brunch,
  };
};

export const evaluationEnvironment = (
  configuration: MatchedParityConfiguration,
  arm: EvaluationArm,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
  const { websiteMode } = configuration.arms[arm];
  const environment: NodeJS.ProcessEnv = {
    ...base,
    PETRINAUT_AI_MODEL: configuration.stock.model,
    BRUNCH_CHAT_MODEL: configuration.brunch.model,
    BRUNCH_CHAT_THINKING: configuration.brunch.reasoning,
    VITE_BRUNCH_CHAT_ENDPOINT: "/agents/chat",
    VITE_PETRINAUT_DEFAULT_ASSISTANT: configuration.arms[arm].assistant,
  };
  if (websiteMode === null) delete environment.VITE_BRUNCH_EVALUATION_MODE;
  else environment.VITE_BRUNCH_EVALUATION_MODE = websiteMode;
  return environment;
};
