import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/step-definitions";
import type {
  ArrayPayload,
  DeepReadOnly,
  Flow,
  OutputDefinition,
  Payload,
  StepInputSource,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";

import { getAllStepsInFlow } from "./get-all-steps-in-flow";
import { getStepDefinitionFromFlow } from "./get-step-definition-from-flow";

/**
 * This method is used to pass the outputs of a step to any unprocessed steps
 * that may depend on them in their inputs.
 */
export const passOutputsToUnprocessedSteps = (params: {
  flow: Flow;
  stepId: string;
  outputDefinitions: DeepReadOnly<OutputDefinition[]>;
  outputs: StepOutput[];
  processedStepIds: string[];
}): Omit<Status<never>, "contents"> => {
  const { flow, stepId, processedStepIds, outputs, outputDefinitions } = params;

  const unprocessedSteps = getAllStepsInFlow(flow).filter(
    (step) =>
      !processedStepIds.some(
        (processedStepId) => processedStepId === step.stepId,
      ),
  );

  for (const unprocessedStep of unprocessedSteps) {
    if (unprocessedStep.kind === "action") {
      const unprocessedActionStepDefinition = getStepDefinitionFromFlow({
        step: unprocessedStep,
        flow,
      });

      const { inputSources } = unprocessedActionStepDefinition;

      const [currentStepIdWithoutIndex, currentStepIdIndex] = stepId.split("~");

      const matchingInputSources = inputSources.filter(
        (
          inputSource,
        ): inputSource is Extract<StepInputSource, { kind: "step-output" }> =>
          inputSource.kind === "step-output" &&
          inputSource.sourceStepId === currentStepIdWithoutIndex,
      );

      const [_, unprocessedStepIdIndex] = unprocessedStep.stepId.split("~");

      if (currentStepIdIndex && currentStepIdIndex !== unprocessedStepIdIndex) {
        /**
         * If the current step is a parallelized step, and the unprocessed
         * step can only consume its outputs if it is also running in the
         * same parallelized branch.
         */
        continue;
      }

      for (const matchingInputSource of matchingInputSources) {
        const matchingOutputDefinition = outputDefinitions.find(
          ({ name }) => name === matchingInputSource.sourceStepOutputName,
        )!;

        const matchingOutput = outputs.find(
          ({ outputName }) =>
            outputName === matchingInputSource.sourceStepOutputName,
        )!;

        const matchingInputDefinition = actionDefinitions[
          unprocessedStep.actionDefinitionId
        ].inputs.find(({ name }) => matchingInputSource.inputName === name)!;

        if (matchingOutputDefinition.array === matchingInputDefinition.array) {
          /**
           * If the output and input are both arrays, or both not arrays, we
           * can directly pass the output value as the input value for the
           * unprocessed step.
           */

          unprocessedStep.inputs = [
            ...(unprocessedStep.inputs ?? []),
            {
              inputName: matchingInputSource.inputName,
              payload: matchingOutput.payload,
            },
          ];
        } else if (
          !matchingOutputDefinition.array &&
          matchingInputDefinition.array
        ) {
          if (Array.isArray(matchingOutput.payload.value)) {
            return {
              code: StatusCode.Internal,
              message: `The output for step ${stepId} is an array, but its output definition defines it as a single value.`,
            };
          }
          /**
           * If the output is not an array, but the input is an array, we can
           * wrap the output value in an array to pass it as the input value.
           */

          const payload: Payload = {
            kind: matchingOutput.payload.kind,
            value: [matchingOutput.payload.value],
            /** @todo: figure out why this isn't assignable */
          } as Payload;

          unprocessedStep.inputs = [
            ...(unprocessedStep.inputs ?? []),
            {
              inputName: matchingInputSource.inputName,
              payload,
            },
          ];
        }
      }
    } else {
      const unprocessedParallelGroupStepDefinition = getStepDefinitionFromFlow({
        step: unprocessedStep,
        flow,
      });

      const { inputSourceToParallelizeOn } =
        unprocessedParallelGroupStepDefinition;

      if (
        inputSourceToParallelizeOn.kind === "step-output" &&
        stepId === inputSourceToParallelizeOn.sourceStepId
      ) {
        /**
         * If the unprocessed parallel group step depends on the output of
         * the current step, we can set the input to parallelize on for
         * the step.
         */

        const matchingOutput = outputs.find(
          ({ outputName }) =>
            outputName === inputSourceToParallelizeOn.sourceStepOutputName,
        )!;

        unprocessedStep.inputToParallelizeOn = {
          inputName: inputSourceToParallelizeOn.inputName,
          payload: matchingOutput.payload as ArrayPayload,
        };
      }
    }
  }

  const processedSteps = getAllStepsInFlow(flow).filter((step) =>
    processedStepIds.some((processedStepId) => processedStepId === step.stepId),
  );

  for (const processedStep of processedSteps) {
    if (processedStep.kind === "parallel-group") {
      const unprocessedParallelGroupStepDefinition = getStepDefinitionFromFlow({
        step: processedStep,
        flow,
      });

      /**
       * If the current step is a parallel step in the unprocessed parallel group,
       * then we can check whether one of its outputs should be added to the
       * aggregate output of the parallel group.
       */

      const { aggregateOutput } = unprocessedParallelGroupStepDefinition;

      const isCurrentStepInParallelGroup = processedStep.steps?.some(
        (step) => step.stepId === stepId,
      );

      const [currentStepIdWithoutIndex] = stepId.split("~");

      if (
        isCurrentStepInParallelGroup &&
        aggregateOutput.stepId === currentStepIdWithoutIndex
      ) {
        const matchingOutput = outputs.find(
          ({ outputName }) => outputName === aggregateOutput.stepOutputName,
        )!;

        const aggregateOutputPayload: ArrayPayload = {
          kind: aggregateOutput.payloadKind,
          value: [
            ...(processedStep.aggregateOutput?.payload.value ?? []),
            matchingOutput.payload.value,
          ].flat(),
        } as ArrayPayload;

        const { inputSourceToParallelizeOn } =
          unprocessedParallelGroupStepDefinition;

        processedStep.aggregateOutput = {
          outputName: inputSourceToParallelizeOn.inputName,
          payload: aggregateOutputPayload,
        };

        if (
          processedStep.inputToParallelizeOn &&
          processedStep.inputToParallelizeOn.payload.value.length ===
            processedStep.aggregateOutput.payload.value.length
        ) {
          /**
           * If the number of items in the input that were parallelized on is
           * the same as the number of items in the updated aggregate output,
           * this means all steps in the parallel group have been processed.
           * We can now pass the aggregate output of the parallel group to
           * any step that may depend on it.
           */
          return passOutputsToUnprocessedSteps({
            flow,
            stepId: processedStep.stepId,
            outputDefinitions: [
              unprocessedParallelGroupStepDefinition.aggregateOutput,
            ],
            outputs: [processedStep.aggregateOutput],
            processedStepIds,
          });
        }
      }
    }
  }

  return { code: StatusCode.Ok };
};
