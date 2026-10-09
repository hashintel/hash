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
) => {
  /** Each step, with the ids of the for-each steps enclosing it, outermost first. */
  const stepsById = new Map<
    string,
    { step: StepDefinition<string>; scope: string[] }
  >();

  const collectSteps = (steps: StepDefinition<string>[], scope: string[]) => {
    for (const step of steps) {
      if (!stepsById.has(step.stepId)) {
        stepsById.set(step.stepId, { step, scope });
      }

      if (step.kind === "for-each") {
        collectSteps(step.steps, [...scope, step.stepId]);
      }
    }
  };

  collectSteps(flowDefinition.steps, []);

  const getActionDefinition = (actionDefinitionId: string) =>
    Object.hasOwn(actionDefinitions, actionDefinitionId)
      ? actionDefinitions[actionDefinitionId]
      : undefined;

  /** Outputs being resolved, so that a `kindFrom` that leads back to itself resolves to `null`. */
  const resolving = new Set<string>();

  const getSourceShape = (
    source: StepInputSource,
    scope: string[],
  ): ConnectionSource | null => {
    switch (source.kind) {
      case "flow-input": {
        const flowInput = flowDefinition.inputs.find(
          ({ name }) => name === source.inputName,
        );

        return flowInput
          ? {
              payloadKind: flowInput.payloadKind,
              array: flowInput.array,
              required: flowInput.required,
            }
          : null;
      }

      case "step-output":
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the two resolve each other
        return getStepOutputShape(source.stepId, source.outputName);

      case "item": {
        const forEachStepId = scope.at(-1);
        const forEach =
          forEachStepId === undefined
            ? undefined
            : stepsById.get(forEachStepId);

        if (forEach?.step.kind !== "for-each") {
          return null;
        }

        const overShape = getSourceShape(forEach.step.over, forEach.scope);

        return overShape
          ? { payloadKind: overShape.payloadKind, array: false, required: true }
          : null;
      }

      case "constant":
        return {
          payloadKind: source.payload.kind,
          array: Array.isArray(source.payload.value),
          required: true,
        };
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

    return source
      ? (getSourceShape(source, entry.scope)?.payloadKind ?? null)
      : null;
  };

  const getStepOutputShape = (
    stepId: string,
    outputName: string,
  ): ConnectionSource | null => {
    const entry = stepsById.get(stepId);

    if (!entry) {
      return null;
    }

    const { step } = entry;

    if (step.kind === "for-each") {
      if (outputName !== step.collect.as) {
        return null;
      }

      const collectedShape = getStepOutputShape(
        step.collect.stepId,
        step.collect.outputName,
      );

      return collectedShape
        ? {
            payloadKind: collectedShape.payloadKind,
            array: true,
            required: true,
          }
        : null;
    }

    const output = getActionDefinition(step.actionDefinitionId)?.outputs.find(
      ({ name }) => name === outputName,
    );

    if (!output) {
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

      return payloadKind
        ? { payloadKind, array: output.array, required: output.required }
        : null;
    } finally {
      resolving.delete(key);
    }
  };

  return { getSourceShape, getInputKind, getStepOutputShape };
};

export type StepShapeResolver = ReturnType<typeof createStepShapeResolver>;
