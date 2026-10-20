import {
  actionDefinitions,
  getKindSources,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";

import { generateActionSubnetName } from "../../flow-net-keys.js";

import type {
  ActionDefinition,
  ActionStepDefinition,
  FlowActionDefinitionId,
  FlowDefinition,
  ForEachStepDefinition,
  PayloadKind,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

export type ValueShape = { payloadKind: PayloadKind; array: boolean };

export type StepEntry = {
  step: StepDefinition;
  /** The for-each steps enclosing the step, outermost first. */
  scope: string[];
};

export const getActionDefinition = (
  step: ActionStepDefinition,
): ActionDefinition<FlowActionDefinitionId> =>
  actionDefinitions[step.actionDefinitionId];

/**
 * Every step of a flow, including those nested in for-each steps, with the shapes of their outputs and the subnet
 * each action step is an instance of.
 */
export type FlowSteps = ReturnType<typeof indexFlowSteps>;

export const indexFlowSteps = (flowDefinition: FlowDefinition) => {
  const shapes = createStepShapeResolver(flowDefinition);

  const stepsById = new Map<string, StepEntry>();

  const indexSteps = (steps: StepDefinition[], scope: string[]) => {
    for (const step of steps) {
      stepsById.set(step.stepId, { step, scope });

      if (step.kind === "for-each") {
        indexSteps(step.steps, [...scope, step.stepId]);
      }
    }
  };

  indexSteps(flowDefinition.steps, []);

  const getStep = (stepId: string): StepEntry => {
    const entry = stepsById.get(stepId);

    if (!entry) {
      throw new Error(`There is no step "${stepId}"`);
    }

    return entry;
  };

  const getOutputShape = (stepId: string, outputName: string): ValueShape => {
    const { step } = getStep(stepId);

    if (step.kind === "for-each") {
      return {
        payloadKind: getOutputShape(
          step.collect.stepId,
          step.collect.outputName,
        ).payloadKind,
        array: true,
      };
    }

    /* An output that takes its kind from an input (`kindFrom`) has the kind connected to that input. */
    const shape = shapes.getStepOutputShape(stepId, outputName);

    if (!shape) {
      throw new Error(`Step "${stepId}" has no output "${outputName}"`);
    }

    return { payloadKind: shape.payloadKind, array: shape.array };
  };

  /** The shape of the array a for-each step iterates over. */
  const getForEachArrayShape = (step: ForEachStepDefinition): ValueShape => {
    const { over } = step;

    switch (over.kind) {
      case "flow-input": {
        const input = flowDefinition.inputs.find(
          ({ name }) => name === over.inputName,
        );

        if (!input) {
          throw new Error(`There is no flow input "${over.inputName}"`);
        }

        return { payloadKind: input.payloadKind, array: input.array };
      }
      case "step-output":
        return getOutputShape(over.stepId, over.outputName);
      case "constant":
        return {
          payloadKind: over.payload.kind,
          array: Array.isArray(over.payload.value),
        };
      case "item":
        throw new Error(
          `for-each step "${step.stepId}" can't iterate over an item`,
        );
    }
  };

  /**
   * The kinds a step's subnet is typed by, for an action with derived kinds: the kind connected to
   * each input a `kindFrom` names. Empty for any other action.
   */
  const getResolvedKinds = (step: ActionStepDefinition) =>
    Object.fromEntries(
      [...getKindSources(getActionDefinition(step)).keys()].map((inputName) => {
        const kind = shapes.getInputKind(step.stepId, inputName);

        if (!kind) {
          throw new Error(
            `Step "${step.stepId}" doesn't connect input "${inputName}", that other inputs or outputs take their kind from`,
          );
        }

        return [inputName, kind];
      }),
    );

  const getSubnetName = (step: ActionStepDefinition) =>
    generateActionSubnetName(step.actionDefinitionId, getResolvedKinds(step));

  return {
    /** Every step, including those nested in for-each steps, in the order they appear in the definition. */
    entries: [...stepsById.values()],
    getForEachArrayShape,
    getOutputShape,
    getResolvedKinds,
    getSubnetName,
  };
};
