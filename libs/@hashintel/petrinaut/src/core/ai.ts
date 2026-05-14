import type { z } from "zod";

import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import {
  mutationActionInputSchemas,
  type MutationActionInput,
  type MutationActionName,
} from "./action-schemas";
import type { Petrinaut } from "./instance";
import { typedKeys } from "./lib/typed-entries";

export {
  colorSchema,
  differentialEquationSchema,
  metricSchema,
  parameterSchema,
  mutationActionInputSchemas as petrinautAiToolInputSchemas,
  placeSchema,
  scenarioSchema,
  transitionSchema,
} from "./action-schemas";
export type {
  MutationActionInput as PetrinautAiToolInput,
  MutationActionName as PetrinautAiToolName,
} from "./action-schemas";

export type PetrinautAiTool<InputSchema extends z.ZodType> = {
  description: string;
  inputSchema: InputSchema;
};

export type PetrinautAiTools = {
  [Name in MutationActionName]: PetrinautAiTool<
    (typeof mutationActionInputSchemas)[Name]
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

export const petrinautAiTools = createToolBundle(
  mutationActionInputSchemas,
) satisfies PetrinautAiTools;

export type PetrinautAiToolCallbacks = {
  [Name in MutationActionName]: (input: MutationActionInput<Name>) => void;
};

export function createPetrinautAiToolCallbacks(
  instance: Petrinaut,
): PetrinautAiToolCallbacks {
  return {
    addPlace(input) {
      instance.addPlace(input);
    },
    updatePlace(input) {
      instance.updatePlace(input);
    },
    updatePlacePosition(input) {
      instance.updatePlacePosition(input);
    },
    removePlace(input) {
      instance.removePlace(input);
    },
    addTransition(input) {
      instance.addTransition(input);
    },
    updateTransition(input) {
      instance.updateTransition(input);
    },
    updateTransitionPosition(input) {
      instance.updateTransitionPosition(input);
    },
    removeTransition(input) {
      instance.removeTransition(input);
    },
    addArc(input) {
      instance.addArc(input);
    },
    removeArc(input) {
      instance.removeArc(input);
    },
    updateArcWeight(input) {
      instance.updateArcWeight(input);
    },
    updateArcType(input) {
      instance.updateArcType(input);
    },
    updateArcPlace(input) {
      instance.updateArcPlace(input);
    },
    addType(input) {
      instance.addType(input);
    },
    updateType(input) {
      instance.updateType(input);
    },
    removeType(input) {
      instance.removeType(input);
    },
    addTypeElement(input) {
      instance.addTypeElement(input);
    },
    updateTypeElement(input) {
      instance.updateTypeElement(input);
    },
    removeTypeElement(input) {
      instance.removeTypeElement(input);
    },
    moveTypeElement(input) {
      instance.moveTypeElement(input);
    },
    addDifferentialEquation(input) {
      instance.addDifferentialEquation(input);
    },
    updateDifferentialEquation(input) {
      instance.updateDifferentialEquation(input);
    },
    removeDifferentialEquation(input) {
      instance.removeDifferentialEquation(input);
    },
    addParameter(input) {
      instance.addParameter(input);
    },
    updateParameter(input) {
      instance.updateParameter(input);
    },
    removeParameter(input) {
      instance.removeParameter(input);
    },
    addScenario(input) {
      instance.addScenario(input);
    },
    updateScenario(input) {
      instance.updateScenario(input);
    },
    removeScenario(input) {
      instance.removeScenario(input);
    },
    addMetric(input) {
      instance.addMetric(input);
    },
    updateMetric(input) {
      instance.updateMetric(input);
    },
    removeMetric(input) {
      instance.removeMetric(input);
    },
    deleteItemsByIds(input) {
      instance.deleteItemsByIds(input);
    },
    commitNodePositions(input) {
      instance.commitNodePositions(input);
    },
  };
}

export function createPetrinautAiPrompt(): string {
  const example = JSON.stringify(probabilisticSatellitesSDCPN, null, 2);

  return `You are an expert assistant for building Stochastic Dynamic Coloured Petri Nets (SDCPNs) in Petrinaut.

Use the provided tools to directly modify the current net. The tools use Petrinaut's raw mutation interfaces, so include stable IDs, full entity objects where required, and canvas positions for places and transitions.

When creating or revising a net:
- Prefer small, meaningful mutations rather than replacing unrelated content.
- Use coloured-token types when tokens need attributes.
- Use parameters for values the user may want to tune.
- Use stochastic transition lambdas for rate-based firing.
- Use predicate transition lambdas for boolean firing conditions.
- Use transition kernels to transform or generate coloured tokens, including stochastic distributions.
- Use differential equations only for places whose coloured tokens have continuous dynamics.
- Keep executable code self-contained and readable.
- Summarize the changes after calling tools.

You can ask the user follow-up questions to clarify their intent before making any changes.

Here is a compact example Petrinaut document demonstrating coloured tokens, stochastic and predicate transitions, transition kernels with distributions, continuous dynamics, parameters, visualizer code, and scenarios:

\`\`\`json
${example}
\`\`\``;
}
