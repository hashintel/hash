import {
  appendCollectedValue,
  getArrayPayloadLength,
} from "@local/hash-isomorphic-utils/flows/stored-payload-refs";
import { StatusCode } from "@local/status";

import { getAllStepsInFlow } from "./get-all-steps-in-flow.js";
import { getStepDefinitionFromFlowDefinition } from "./get-step-definition-from-flow.js";
import { wrapPayload } from "./initialize-flow.js";

import type {
  ArrayPayload,
  FlowDefinition,
  LocalFlowRun,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

/**
 * Passes the outputs of a step that has just completed to the unprocessed steps that consume them, and
 * collects them into the for-each step it's a branch of, if any.
 */
export const passOutputsToUnprocessedSteps = (params: {
  flow: LocalFlowRun;
  flowDefinition: FlowDefinition;
  stepId: string;
  outputs: StepOutput[];
  processedStepIds: string[];
}): Omit<Status<never>, "contents"> => {
  const { flow, flowDefinition, stepId, processedStepIds, outputs } = params;

  const [currentStepIdWithoutIndex, currentStepIdIndex] = stepId.split("~");

  const unprocessedSteps = getAllStepsInFlow(flow).filter(
    (step) =>
      !processedStepIds.some(
        (processedStepId) => processedStepId === step.stepId,
      ),
  );

  for (const unprocessedStep of unprocessedSteps) {
    const [_, unprocessedStepIdIndex] = unprocessedStep.stepId.split("~");

    if (currentStepIdIndex && currentStepIdIndex !== unprocessedStepIdIndex) {
      /**
       * A step in a for-each branch only feeds steps in the same branch.
       */
      continue;
    }

    if (unprocessedStep.kind === "action") {
      const { inputs } = getStepDefinitionFromFlowDefinition({
        step: unprocessedStep,
        flowDefinition,
      });

      for (const [inputName, source] of Object.entries(inputs)) {
        if (
          source.kind !== "step-output" ||
          source.stepId !== currentStepIdWithoutIndex
        ) {
          continue;
        }

        const matchingOutput = outputs.find(
          ({ outputName }) => outputName === source.outputName,
        );

        if (!matchingOutput) {
          /* The output is optional, and the step didn't produce it. */
          continue;
        }

        unprocessedStep.inputs = [
          ...(unprocessedStep.inputs ?? []),
          {
            inputName,
            payload: source.wrap
              ? wrapPayload(matchingOutput.payload)
              : matchingOutput.payload,
          },
        ];
      }
    } else {
      const { over } = getStepDefinitionFromFlowDefinition({
        step: unprocessedStep,
        flowDefinition,
      });

      if (
        over.kind === "step-output" &&
        over.stepId === currentStepIdWithoutIndex
      ) {
        const matchingOutput = outputs.find(
          ({ outputName }) => outputName === over.outputName,
        );

        if (matchingOutput) {
          unprocessedStep.over = matchingOutput.payload as ArrayPayload;
        }
      }
    }
  }

  const processedSteps = getAllStepsInFlow(flow).filter((step) =>
    processedStepIds.some((processedStepId) => processedStepId === step.stepId),
  );

  for (const processedStep of processedSteps) {
    if (processedStep.kind !== "for-each") {
      continue;
    }

    const { collect } = getStepDefinitionFromFlowDefinition({
      step: processedStep,
      flowDefinition,
    });

    const isCurrentStepInForEachStep = processedStep.steps?.some(
      (step) => step.stepId === stepId,
    );

    if (
      !isCurrentStepInForEachStep ||
      collect.stepId !== currentStepIdWithoutIndex
    ) {
      continue;
    }

    const collectedOutput = outputs.find(
      ({ outputName }) => outputName === collect.outputName,
    );

    if (!collectedOutput) {
      return {
        code: StatusCode.Internal,
        message: `Step ${stepId} did not produce output "${collect.outputName}", which for-each step ${processedStep.stepId} collects`,
      };
    }

    /*
     * Array outputs are concatenated, stored arrays by reference, so that no stored payload is fetched here.
     */
    processedStep.collected = {
      outputName: collect.as,
      payload: {
        kind: collectedOutput.payload.kind,
        value: appendCollectedValue(
          processedStep.collected?.payload.value as
            | Parameters<typeof appendCollectedValue>[0]
            | undefined,
          collectedOutput.payload.value,
        ),
      } as ArrayPayload,
    };

    processedStep.collectedBranchCount =
      (processedStep.collectedBranchCount ?? 0) + 1;

    const itemCount = processedStep.over
      ? getArrayPayloadLength(processedStep.over.value)
      : undefined;

    if (processedStep.collectedBranchCount === itemCount) {
      /**
       * Every branch has contributed its output, so the for-each step's collected output is complete: pass it
       * to the steps that consume it.
       */
      return passOutputsToUnprocessedSteps({
        flow,
        flowDefinition,
        stepId: processedStep.stepId,
        outputs: [processedStep.collected],
        processedStepIds,
      });
    }
  }

  return { code: StatusCode.Ok };
};
