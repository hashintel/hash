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
 * Works out the shape of each value in a flow definition: its kind, whether it's an array, and whether it's always
 * present. A step output usually has the shape its action declares, but one that takes its kind from an input
 * (`kindFrom`) has the kind of whatever is connected to that input.
 *
 * Anything it can't resolve is `null`. `validateFlowDefinition` uses it to check connections, and the engine where
 * it needs a kind it has no value to read from.
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

  /**
   * The kind connected to an action step's input, if it's connected and resolves.
   */
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
