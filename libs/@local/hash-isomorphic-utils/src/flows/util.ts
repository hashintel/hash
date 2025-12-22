import {
  aiActionDefinitions,
  integrationActionDefinitions,
} from "./action-definitions.js";
import { triggerDefinitions } from "./trigger-definitions.js";
import type {
  ActionDefinition,
  ActionStepWithParallelInput,
  FlowActionDefinitionId,
  FlowDefinition,
  ParallelGroupStepDefinition,
  StepDefinition,
} from "./types.js";

export type FlowType = "ai" | "integration";

type ActionDefinitionsMap<T extends FlowActionDefinitionId> = Record<
  T,
  ActionDefinition<T>
>;

const getActionDefinitions = <T extends FlowActionDefinitionId>(
  flowType: FlowType,
): ActionDefinitionsMap<T> => {
  if (flowType === "ai") {
    return aiActionDefinitions as unknown as ActionDefinitionsMap<T>;
  }
  return integrationActionDefinitions as unknown as ActionDefinitionsMap<T>;
};

type FlowStepDefinition<T extends FlowActionDefinitionId> =
  | StepDefinition<T>
  | ActionStepWithParallelInput<T>;

const recursivelyValidateSteps = <T extends FlowActionDefinitionId>(params: {
  actionDefinitions: ActionDefinitionsMap<T>;
  allStepDefinitions: FlowStepDefinition<T>[];
  stepIds: Set<string>;
  flow: FlowDefinition<T>;
  step: FlowStepDefinition<T>;
}) => {
  const { actionDefinitions, flow, step, stepIds, allStepDefinitions } = params;

  if (stepIds.has(step.stepId)) {
    throw new Error(`Duplicate step id: ${step.stepId}`);
  }

  stepIds.add(step.stepId);

  if (step.kind === "parallel-group") {
    const { inputSourceToParallelizeOn } = step;

    const errorPrefix = `Parallel group step "${step.stepId}" `;

    if (inputSourceToParallelizeOn.kind === "step-output") {
      const { sourceStepId, sourceStepOutputName } = inputSourceToParallelizeOn;

      const sourceStep =
        sourceStepId === "trigger"
          ? flow.trigger
          : allStepDefinitions.find(({ stepId }) => stepId === sourceStepId);

      if (!sourceStep) {
        throw new Error(
          `${errorPrefix}references a source step "${sourceStepId}" that does not exist`,
        );
      }

      const sourceStepOutputs = [
        ...(sourceStep.kind === "action"
          ? actionDefinitions[sourceStep.actionDefinitionId].outputs
          : []),
        ...(sourceStep.kind === "trigger"
          ? [
              ...(triggerDefinitions[sourceStep.triggerDefinitionId].outputs ??
                []),
              ...(sourceStep.outputs ?? []),
            ]
          : []),
        ...(sourceStep.kind === "parallel-group"
          ? [sourceStep.aggregateOutput]
          : []),
      ];

      const matchingSourceStepOutput = sourceStepOutputs.find(
        (output) => output.name === sourceStepOutputName,
      );

      if (!matchingSourceStepOutput) {
        throw new Error(
          `${errorPrefix}parallelizes on an output "${sourceStepOutputName}" of step "${sourceStepId}" that does not exist`,
        );
      }

      if (!matchingSourceStepOutput.array) {
        throw new Error(
          `${errorPrefix}parallelizes an output "${sourceStepOutputName}" of step "${sourceStepId}" that is not an array`,
        );
      }

      const childActionSteps = step.steps.filter(
        (
          childStep,
        ): childStep is Extract<FlowStepDefinition<T>, { kind: "action" }> =>
          childStep.kind === "action",
      );

      for (const childActionStep of childActionSteps) {
        for (const childActionInputSource of childActionStep.inputSources) {
          if (childActionInputSource.kind === "parallel-group-input") {
            const { actionDefinitionId } = childActionStep;

            const matchingDefinitionInput = actionDefinitions[
              actionDefinitionId
            ].inputs.find(
              (input) => input.name === childActionInputSource.inputName,
            );

            if (!matchingDefinitionInput) {
              throw new Error(
                `Action step "${childActionStep.stepId}" in parallel group "${step.stepId}" has an input source for input "${childActionInputSource.inputName}" that is not defined in its action definition`,
              );
            }

            if (matchingDefinitionInput.array) {
              throw new Error(
                `Action step "${childActionStep.stepId}" in parallel group "${step.stepId}" references an input "${childActionInputSource.inputName}" that is an array`,
              );
            }

            if (
              !matchingDefinitionInput.oneOfPayloadKinds.includes(
                matchingSourceStepOutput.payloadKind,
              )
            ) {
              throw new Error(
                `Action step "${childActionStep.stepId}" in parallel group "${step.stepId}" references an output "${sourceStepOutputName}" of step "${sourceStepId}" that does not match the expected payload kinds of the input`,
              );
            }
          }
        }
      }
      /* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */
    } else if (inputSourceToParallelizeOn.kind === "hardcoded") {
      /**
       * Note we don't need to validate whether the hardcoded value is an array,
       * because this is enforced via the types.
       */
    }

    const { aggregateOutput } = step;

    const childStepUsedForAggregateOutput = step.steps.find(
      (childStep) => childStep.stepId === aggregateOutput.stepId,
    );

    if (!childStepUsedForAggregateOutput) {
      throw new Error(
        `${errorPrefix}references an aggregate output source step "${aggregateOutput.stepId}" that does not exist in is child steps`,
      );
    }

    if (childStepUsedForAggregateOutput.kind === "action") {
      const childActionStepOutput = actionDefinitions[
        childStepUsedForAggregateOutput.actionDefinitionId
      ].outputs.find(
        (output) => output.name === aggregateOutput.stepOutputName,
      );

      if (!childActionStepOutput) {
        throw new Error(
          `${errorPrefix}references an aggregate output source step output "${aggregateOutput.stepOutputName}" that does not exist in its child step`,
        );
      }
      /* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */
    } else if (childStepUsedForAggregateOutput.kind === "parallel-group") {
      if (
        childStepUsedForAggregateOutput.aggregateOutput.name !==
        aggregateOutput.name
      ) {
        throw new Error(
          `${errorPrefix}references an aggregate output source step output "${aggregateOutput.stepOutputName}" that does not exist in its child step`,
        );
      }
    }

    for (const childStep of step.steps) {
      recursivelyValidateSteps({
        actionDefinitions,
        stepIds,
        flow,
        step: childStep,
        allStepDefinitions,
      });
    }
    /* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */
  } else if (step.kind === "action") {
    const { actionDefinitionId, inputSources } = step;

    const requiredInputs = actionDefinitions[actionDefinitionId].inputs.filter(
      ({ required }) => required,
    );

    for (const requiredInput of requiredInputs) {
      const matchingInputSource = inputSources.find(
        (inputSource) => inputSource.inputName === requiredInput.name,
      );

      if (!matchingInputSource && !requiredInput.default) {
        throw new Error(
          `Action step "${step.stepId}" is missing required input "${requiredInput.name}"`,
        );
      }
    }

    for (const inputSource of inputSources) {
      const matchingDefinitionInput = actionDefinitions[
        actionDefinitionId
      ].inputs.find((input) => input.name === inputSource.inputName);

      if (!matchingDefinitionInput) {
        throw new Error(
          `Action step "${step.stepId}" has an input source for input "${inputSource.inputName}" that is not defined in its action definition`,
        );
      }

      const errorPrefix = `Action step "${step.stepId}" with input "${inputSource.inputName}" `;

      if (inputSource.kind === "step-output") {
        const { sourceStepId } = inputSource;

        const sourceStep =
          sourceStepId === "trigger"
            ? flow.trigger
            : allStepDefinitions.find(({ stepId }) => stepId === sourceStepId);

        if (!sourceStep) {
          throw new Error(
            `${errorPrefix}references a source step "${sourceStepId}" that does not exist`,
          );
        }

        const sourceStepOutputs = [
          ...(sourceStep.kind === "action"
            ? actionDefinitions[sourceStep.actionDefinitionId].outputs
            : []),
          ...(sourceStep.kind === "trigger"
            ? [
                ...(triggerDefinitions[sourceStep.triggerDefinitionId]
                  .outputs ?? []),
                ...(sourceStep.outputs ?? []),
              ]
            : []),
          ...(sourceStep.kind === "parallel-group"
            ? [sourceStep.aggregateOutput]
            : []),
        ];

        const matchingSourceStepOutput = sourceStepOutputs.find(
          (output) => output.name === inputSource.sourceStepOutputName,
        );

        if (!matchingSourceStepOutput) {
          throw new Error(
            `${errorPrefix}references an output "${inputSource.sourceStepOutputName}" of step "${inputSource.sourceStepId}" that does not exist`,
          );
        }

        if (
          !matchingDefinitionInput.oneOfPayloadKinds.includes(
            matchingSourceStepOutput.payloadKind,
          )
        ) {
          throw new Error(
            `${errorPrefix}references an output "${inputSource.sourceStepOutputName}" of step "${inputSource.sourceStepId}" that does not match the expected payload kinds of the input`,
          );
        }
      } else if (inputSource.kind === "hardcoded") {
        if (
          !matchingDefinitionInput.oneOfPayloadKinds.includes(
            inputSource.payload.kind,
          )
        ) {
          throw new Error(
            `${errorPrefix}references a hardcoded value that does not match the expected payload kinds of the input`,
          );
        }
      }

      if (
        "fallbackValue" in inputSource &&
        "fallbackPayload" in inputSource &&
        inputSource.fallbackPayload
      ) {
        if (
          !matchingDefinitionInput.oneOfPayloadKinds.includes(
            inputSource.fallbackPayload.kind,
          )
        ) {
          throw new Error(
            `${errorPrefix}references a fallback value that does not match the expected payload kinds of the input`,
          );
        }
      }
    }
  }
};

const getAllStepDefinitionsInParallelGroupDefinition = <
  T extends FlowActionDefinitionId,
>(
  stepDefinition: ParallelGroupStepDefinition<T>,
): FlowStepDefinition<T>[] => [
  ...stepDefinition.steps,
  ...stepDefinition.steps.flatMap((childStep) =>
    childStep.kind === "parallel-group"
      ? getAllStepDefinitionsInParallelGroupDefinition(childStep)
      : [],
  ),
];

export const getAllStepDefinitionsInFlowDefinition = <
  T extends FlowActionDefinitionId,
>(
  flow: FlowDefinition<T>,
) => [
  ...flow.steps,
  ...flow.steps.flatMap((step) =>
    step.kind === "parallel-group"
      ? getAllStepDefinitionsInParallelGroupDefinition(step)
      : [],
  ),
];

/**
 * Validates a flow definition to ensure:
 * - Each step has a unique ID.
 * - Required inputs for each step are met and valid.
 * - Input sources (other step outputs, flow triggers, hardcoded values) exist and match expected types.
 *
 * @param flow The flow definition to validate.
 * @param flowType The type of flow ('ai' or 'integration') to determine which action definitions to use.
 * @returns true if the flow definition passes all validation checks.
 */
export const validateFlowDefinition = <T extends FlowActionDefinitionId>(
  flow: FlowDefinition<T>,
  flowType: FlowType,
) => {
  const stepIds = new Set<string>();
  const actionDefinitions = getActionDefinitions<T>(flowType);

  const allStepDefinitions = getAllStepDefinitionsInFlowDefinition(flow);

  for (const step of flow.steps) {
    recursivelyValidateSteps({
      actionDefinitions,
      stepIds,
      flow,
      step,
      allStepDefinitions,
    });
  }

  return true;
};
