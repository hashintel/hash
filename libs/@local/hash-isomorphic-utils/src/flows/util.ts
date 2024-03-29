/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { actionDefinitions, triggerDefinitions } from "./step-definitions";
import type { FlowDefinition } from "./types";

/**
 * Validates a flow definition to ensure:
 * - Each step has a unique ID.
 * - Required inputs for each step are met and valid.
 * - Input sources (other step outputs, flow triggers, hardcoded values) exist and match expected types.
 *
 * @param flow The flow definition to validate.
 * @returns true if the flow definition passes all validation checks.
 */
export const validateFlowDefinition = (flow: FlowDefinition) => {
  const stepIds = new Set<string>();

  const flowStepsWithNestedSteps = [
    ...flow.steps,
    ...flow.steps.flatMap((step) =>
      step.kind === "parallel-group" ? step.steps : [],
    ),
  ];

  for (const step of flowStepsWithNestedSteps) {
    if (stepIds.has(step.stepId)) {
      throw new Error(`Duplicate step id: ${step.stepId}`);
    }
    stepIds.add(step.stepId);

    if (step.kind === "parallel-group") {
      const { inputSourceToParallelizeOn } = step;

      const errorPrefix = `Parallel group step "${step.stepId}" `;

      if (inputSourceToParallelizeOn.kind === "step-output") {
        const { sourceStepId, sourceStepOutputName } =
          inputSourceToParallelizeOn;
        const sourceStep =
          sourceStepId === "trigger"
            ? flow.trigger
            : flowStepsWithNestedSteps.find(
                ({ stepId }) => stepId === sourceStepId,
              );

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

        const { steps: childSteps } = step;

        for (const childActionStep of childSteps) {
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

      const childStepOutput = actionDefinitions[
        childStepUsedForAggregateOutput.actionDefinitionId
      ].outputs.find(
        (output) => output.name === aggregateOutput.stepOutputName,
      );

      if (!childStepOutput) {
        throw new Error(
          `${errorPrefix}references an aggregate output source step output "${aggregateOutput.stepOutputName}" that does not exist in its child step`,
        );
      }
    } else if (step.kind === "action") {
      const { actionDefinitionId, inputSources } = step;

      const requiredInputs = actionDefinitions[
        actionDefinitionId
      ].inputs.filter(({ required }) => required);

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
              : flowStepsWithNestedSteps.find(
                  ({ stepId }) => stepId === sourceStepId,
                );

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
              inputSource.value.kind,
            )
          ) {
            throw new Error(
              `${errorPrefix}references a hardcoded value that does not match the expected payload kinds of the input`,
            );
          }
        }

        if ("fallbackValue" in inputSource && inputSource.fallbackValue) {
          if (
            !matchingDefinitionInput.oneOfPayloadKinds.includes(
              inputSource.fallbackValue.kind,
            )
          ) {
            throw new Error(
              `${errorPrefix}references a fallback value that does not match the expected payload kinds of the input`,
            );
          }
        }
      }
    }
  }

  return true;
};
