import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  appendCollectedValue,
  getArrayPayloadLength,
} from "@local/hash-isomorphic-utils/flows/stored-payload-refs";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import { StatusCode } from "@local/status";

import { getAllStepsInFlow } from "./get-all-steps-in-flow.js";
import { getStepDefinitionFromFlowDefinition } from "./get-step-definition-from-flow.js";
import { wrapPayload } from "./initialize-flow.js";

import type {
  ArrayPayload,
  FlowDefinition,
  ForEachStep,
  ForEachStepDefinition,
  LocalFlowRun,
  PayloadKind,
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

    processedStep.branchValues = {
      ...processedStep.branchValues,
      [Number(currentStepIdIndex)]: collectedOutput.payload.value,
    };

    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the two pass each other's outputs on
    return completeForEachStep({
      flow,
      flowDefinition,
      forEachStep: processedStep,
      processedStepIds,
    });
  }

  return { code: StatusCode.Ok };
};

/**
 * The kind of the values a for-each step collects: the declared kind of the output it collects.
 */
const getCollectedPayloadKind = (
  forEachStepDefinition: ForEachStepDefinition,
): PayloadKind | undefined => {
  const collectedStepDefinition = getAllStepDefinitionsInFlowDefinition(
    forEachStepDefinition,
  ).find(({ stepId }) => stepId === forEachStepDefinition.collect.stepId);

  return collectedStepDefinition?.kind === "action"
    ? actionDefinitions[
        collectedStepDefinition.actionDefinitionId
      ].outputs.find(
        ({ name }) => name === forEachStepDefinition.collect.outputName,
      )?.payloadKind
    : undefined;
};

/**
 * Once every branch of a for-each step has contributed its value, sets the step's collected output and passes
 * it to the steps that consume it. Values are collected in item order, whatever order the branches finish in:
 * array values are concatenated (stored arrays by reference, so that no stored payload is fetched here), and
 * singular values gathered.
 */
export const completeForEachStep = (params: {
  flow: LocalFlowRun;
  flowDefinition: FlowDefinition;
  forEachStep: ForEachStep;
  processedStepIds: string[];
}): Omit<Status<never>, "contents"> => {
  const { flow, flowDefinition, forEachStep, processedStepIds } = params;

  if (!forEachStep.over || forEachStep.collected) {
    return { code: StatusCode.Ok };
  }

  const itemCount = getArrayPayloadLength(forEachStep.over.value);
  const branchValues = forEachStep.branchValues ?? {};

  if (Object.keys(branchValues).length < itemCount) {
    return { code: StatusCode.Ok };
  }

  const forEachStepDefinition = getStepDefinitionFromFlowDefinition({
    step: forEachStep,
    flowDefinition,
  });

  const payloadKind = getCollectedPayloadKind(forEachStepDefinition);

  if (!payloadKind) {
    return {
      code: StatusCode.Internal,
      message: `Could not determine the kind of output step ${forEachStep.stepId} collects`,
    };
  }

  let collectedValue: Parameters<typeof appendCollectedValue>[0];

  for (let index = 0; index < itemCount; index++) {
    const branchValue = branchValues[index];

    if (branchValue !== null) {
      collectedValue = appendCollectedValue(collectedValue, branchValue);
    }
  }

  forEachStep.collected = {
    outputName: forEachStepDefinition.collect.as,
    payload: { kind: payloadKind, value: collectedValue ?? [] } as ArrayPayload,
  };

  return passOutputsToUnprocessedSteps({
    flow,
    flowDefinition,
    stepId: forEachStep.stepId,
    outputs: [forEachStep.collected],
    processedStepIds,
  });
};

/**
 * Records that a step in a for-each branch was skipped. If it's the step the for-each step collects from, the
 * branch contributes nothing, but counts as finished, so that the for-each step can complete.
 */
export const collectSkippedBranchStep = (params: {
  flow: LocalFlowRun;
  flowDefinition: FlowDefinition;
  stepId: string;
  processedStepIds: string[];
}): Omit<Status<never>, "contents"> => {
  const { flow, flowDefinition, stepId, processedStepIds } = params;

  const [stepIdWithoutIndex, branchIndex] = stepId.split("~");

  const forEachStep = getAllStepsInFlow(flow).find(
    (step): step is ForEachStep =>
      step.kind === "for-each" &&
      (step.steps?.some((branchStep) => branchStep.stepId === stepId) ?? false),
  );

  if (
    !forEachStep ||
    getStepDefinitionFromFlowDefinition({ step: forEachStep, flowDefinition })
      .collect.stepId !== stepIdWithoutIndex
  ) {
    return { code: StatusCode.Ok };
  }

  forEachStep.branchValues = {
    ...forEachStep.branchValues,
    [Number(branchIndex)]: null,
  };

  return completeForEachStep({
    flow,
    flowDefinition,
    forEachStep,
    processedStepIds,
  });
};
