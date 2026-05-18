import { z } from "zod";

import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import {
  mutationActionInputSchemas,
  type MutationActionName,
} from "./action-schemas";
import type { Petrinaut } from "./instance";
import { typedKeys } from "./lib/typed-entries";

export {
  colorSchema,
  differentialEquationSchema,
  metricSchema,
  parameterSchema,
  mutationActionInputSchemas,
  placeSchema,
  scenarioSchema,
  transitionSchema,
} from "./action-schemas";
export type {
  MutationActionInput as PetrinautAiMutationToolInput,
  MutationActionName as PetrinautAiMutationToolName,
} from "./action-schemas";

export type PetrinautAiTool<InputSchema extends z.ZodType> = {
  description: string;
  inputSchema: InputSchema;
};

export type PetrinautAiTools = {
  [Name in keyof typeof petrinautAiToolInputSchemas]: PetrinautAiTool<
    (typeof petrinautAiToolInputSchemas)[Name]
  >;
};

const getSchemaDescription = (schema: z.ZodType): string => {
  if (!schema.description) {
    throw new Error("Petrinaut AI tool schemas must have descriptions");
  }
  return schema.description;
};

function createToolBundle<const InputSchemas extends Record<string, z.ZodType>>(
  schemas: InputSchemas,
): {
  [Name in keyof InputSchemas]: PetrinautAiTool<InputSchemas[Name]>;
} {
  const tools = {} as {
    [Name in keyof InputSchemas]: PetrinautAiTool<InputSchemas[Name]>;
  };

  const setTool = <Name extends keyof InputSchemas>(
    name: Name,
    inputSchema: InputSchemas[Name],
  ) => {
    tools[name] = {
      description: getSchemaDescription(inputSchema),
      inputSchema,
    };
  };

  for (const name of typedKeys(schemas)) {
    setTool(name, schemas[name]);
  }

  return tools;
}

export const getLatestNetDefinitionToolName = "getLatestNetDefinition";

const getLatestNetDefinitionToolInputSchema = z
  .strictObject({})
  .describe("Get the latest complete Petrinaut SDCPN net definition.");

export const petrinautAiToolInputSchemas = {
  ...mutationActionInputSchemas,
  [getLatestNetDefinitionToolName]: getLatestNetDefinitionToolInputSchema,
};

export const petrinautAiMutationTools = createToolBundle(
  mutationActionInputSchemas,
);

export const petrinautAiTools = {
  ...petrinautAiMutationTools,
  [getLatestNetDefinitionToolName]: {
    description: getSchemaDescription(getLatestNetDefinitionToolInputSchema),
    inputSchema: getLatestNetDefinitionToolInputSchema,
  },
} satisfies PetrinautAiTools;

export type PetrinautAiToolName = keyof typeof petrinautAiTools;

export type PetrinautAiToolInput<Name extends PetrinautAiToolName> = z.input<
  (typeof petrinautAiTools)[Name]["inputSchema"]
>;

export type PetrinautMutationAiToolCallbacks = Pick<
  Petrinaut,
  MutationActionName
>;

export function createPetrinautMutationAiToolCallbacks(
  instance: Petrinaut,
): PetrinautMutationAiToolCallbacks {
  return instance;
}

export const petrinautAiPrompt = `You are an expert assistant for building Stochastic Dynamic Coloured Petri Nets (SDCPNs) in Petrinaut.

Use the provided tools to directly modify the current net. The tools use Petrinaut's raw mutation interfaces, so include stable IDs, full entity objects where required, and canvas positions for places and transitions.
You can check the latest complete net definition at any point using the ${getLatestNetDefinitionToolName} tool. Use it before making changes that depend on existing places, transitions, arcs, scenarios, metrics, parameters, or types.

When the user's intent, requirements, constraints, or preferred modelling process are ambiguous, ask a concise follow-up question before making changes. If the request is clear, proceed with small, purposeful tool calls.

When creating or revising a net:
- Prefer small, meaningful mutations rather than replacing unrelated content.
- Use coloured-token types when tokens need attributes.
- Use parameters for values the user may want to tune.
- When adding scenarios, prefer scenario parameters for key assumptions the user may want to modify between runs. Reference them as scenario.identifier in parameter overrides and initial-state expressions.
- Use stochastic transition lambdas for rate-based firing.
- Use predicate transition lambdas for boolean firing conditions.
- Use transition kernels to transform or generate coloured tokens, including stochastic distributions.
- Use differential equations only for places whose coloured tokens have continuous dynamics.
- Keep executable code self-contained and readable.

After calling tools, do not merely summarize the added or updated items, because the user can already see those changes in the UI. Final text should add extra value: explain important modelling choices, assumptions, how the pieces work together, and useful next checks or questions.

Here is a compact example Petrinaut document demonstrating coloured tokens, stochastic and predicate transitions, transition kernels with distributions, continuous dynamics, parameters, visualizer code, and scenarios:

\`\`\`json
${JSON.stringify(probabilisticSatellitesSDCPN, null, 2)}
\`\`\``;
