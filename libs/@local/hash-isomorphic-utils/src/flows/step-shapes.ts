import { actionDefinitions as defaultActionDefinitions } from "./action-definitions.js";

import type { ConnectionSource } from "./can-connect.js";
import type {
  ActionDefinition,
  FlowActionDefinitionId,
  FlowDefinition,
  PayloadKind,
  StepDefinition,
  StepInputSource,
} from "./types.js";

export type ActionDefinitions = Record<
  string,
  ActionDefinition<FlowActionDefinitionId>
>;

/** Each step, with the ids of the for-each steps enclosing it, outermost first. */
type StepsById = Map<string, { step: StepDefinition<string>; scope: string[] }>;

type GetSource = (
  source: StepInputSource,
  scope: string[],
) => ConnectionSource | null;

type GetStepOutput = (
  stepId: string,
  outputName: string,
) => ConnectionSource | null;

const collectSteps = (
  stepsById: StepsById,
  steps: StepDefinition<string>[],
  scope: string[],
): void => {
  for (const step of steps) {
    if (!stepsById.has(step.stepId)) {
      stepsById.set(step.stepId, { step, scope });
    }

    if (step.kind === "for-each") {
      collectSteps(stepsById, step.steps, [...scope, step.stepId]);
    }
  }
};

/** The shape of the current item of the innermost for-each step enclosing a step in `scope`. */
const resolveItem = (
  stepsById: StepsById,
  scope: string[],
  getSource: GetSource,
): ConnectionSource | null => {
  const forEachStepId = scope.at(-1);

  if (forEachStepId === undefined) {
    return null;
  }

  const forEach = stepsById.get(forEachStepId);

  if (forEach?.step.kind !== "for-each") {
    return null;
  }

  const over = getSource(forEach.step.over, forEach.scope);

  if (over === null) {
    return null;
  }

  return { payloadKind: over.payloadKind, array: false, required: true };
};

/** The shape of an output collected by a for-each step. */
const resolveCollected = ({
  stepsById,
  step,
  outputName,
  getStepOutput,
}: {
  stepsById: StepsById;
  step: Extract<StepDefinition<string>, { kind: "for-each" }>;
  outputName: string;
  getStepOutput: GetStepOutput;
}): ConnectionSource | null => {
  /*
   * A for-each step can only collect from a step directly inside it. Steps inside steps form a tree, so
   * following a collect this way always ends.
   */
  if (
    outputName !== step.collect.as ||
    stepsById.get(step.collect.stepId)?.scope.at(-1) !== step.stepId
  ) {
    return null;
  }

  const collected = getStepOutput(step.collect.stepId, step.collect.outputName);

  if (collected === null) {
    return null;
  }

  return { payloadKind: collected.payloadKind, array: true, required: true };
};

export interface StepShapeResolver {
  getSourceShape: GetSource;
  getInputKind: (stepId: string, inputName: string) => PayloadKind | null;
  getStepOutputShape: GetStepOutput;
}

/**
 * Works out the shape of any value in a flow definition: its kind, whether it's an array, and whether it's always
 * present.
 *
 * Most step outputs have the shape their action declares. An output with a derived kind (see `KindFrom`) gets the
 * kind connected to its kind source, following `forEach` items, collected outputs and other derived kinds to find
 * it.
 *
 * Returns `null` for anything it can't resolve. The validator uses it to check connections, and the engine to find a
 * kind where it has no value to read the kind from.
 */
export const createStepShapeResolver = (
  flowDefinition: FlowDefinition<string>,
  actionDefinitions: ActionDefinitions = defaultActionDefinitions,
): StepShapeResolver => {
  const stepsById: StepsById = new Map();

  collectSteps(stepsById, flowDefinition.steps, []);

  const getActionDefinition = (
    actionDefinitionId: string,
  ): ActionDefinition<FlowActionDefinitionId> | undefined =>
    Object.hasOwn(actionDefinitions, actionDefinitionId)
      ? actionDefinitions[actionDefinitionId]
      : undefined;

  /** Outputs being resolved, so that a `kindFrom` that leads back to itself resolves to `null`. */
  const resolving = new Set<string>();

  const getSource: GetSource = (source, scope) => {
    switch (source.kind) {
      case "flow-input": {
        const flowInput = flowDefinition.inputs.find(
          ({ name }) => name === source.inputName,
        );

        if (flowInput === undefined) {
          return null;
        }

        return {
          payloadKind: flowInput.payloadKind,
          array: flowInput.array,
          required: flowInput.required,
        };
      }

      case "step-output": {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the two resolve each other
        return getStepOutput(source.stepId, source.outputName);
      }

      case "item": {
        return resolveItem(stepsById, scope, getSource);
      }

      case "constant": {
        return {
          payloadKind: source.payload.kind,
          array: Array.isArray(source.payload.value),
          required: true,
        };
      }
    }
  };

  /** The kind of the value connected to a step's input, or `null` if it isn't connected or doesn't resolve. */
  const getInputKind = (
    stepId: string,
    inputName: string,
  ): PayloadKind | null => {
    const entry = stepsById.get(stepId);

    if (entry?.step.kind !== "action") {
      return null;
    }

    const source = entry.step.inputs[inputName];

    if (source === undefined) {
      return null;
    }

    return getSource(source, entry.scope)?.payloadKind ?? null;
  };

  const getStepOutput: GetStepOutput = (stepId, outputName) => {
    const entry = stepsById.get(stepId);

    if (entry === undefined) {
      return null;
    }

    const { step } = entry;

    if (step.kind === "for-each") {
      return resolveCollected({ stepsById, step, outputName, getStepOutput });
    }

    const output = getActionDefinition(step.actionDefinitionId)?.outputs.find(
      ({ name }) => name === outputName,
    );

    if (output === undefined) {
      return null;
    }

    if ("payloadKind" in output) {
      return {
        payloadKind: output.payloadKind,
        array: output.array,
        required: output.required,
      };
    }

    const key = `${stepId}\u0000${outputName}`;

    if (resolving.has(key)) {
      return null;
    }

    resolving.add(key);

    try {
      const payloadKind = getInputKind(stepId, output.kindFrom);

      if (payloadKind === null) {
        return null;
      }

      return { payloadKind, array: output.array, required: output.required };
    } finally {
      resolving.delete(key);
    }
  };

  return {
    getSourceShape: getSource,
    getInputKind,
    getStepOutputShape: getStepOutput,
  };
};
