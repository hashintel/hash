import {
  generateStepRunId,
  parseStepRunId,
} from "@local/hash-isomorphic-utils/flows/step-run-id";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";
import {
  appendCollectedValue,
  getArrayPayloadLength,
} from "@local/hash-isomorphic-utils/flows/stored-payload-refs";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import { StatusCode } from "@local/status";

import { getStepDefinitionFromFlowDefinition } from "./get-step-definition-from-flow.js";
import { wrapPayload } from "./initialize-flow.js";

import type {
  ArrayPayload,
  FlowDefinition,
  ForEachStep,
  ForEachStepDefinition,
  FlowStep,
  PayloadKind,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

/**
 * The for-each step definition whose items a step, given by its definition's id, runs in, if any.
 */
const getEnclosingForEachStepDefinition = (
  flowDefinition: FlowDefinition,
  stepId: string,
) =>
  getAllStepDefinitionsInFlowDefinition(flowDefinition).find(
    (stepDefinition): stepDefinition is ForEachStepDefinition =>
      stepDefinition.kind === "for-each" &&
      stepDefinition.steps.some((nested) => nested.stepId === stepId),
  );

/** Gives an unprocessed step the outputs it takes from a step that has just completed. */
const passOutputsToStep = ({
  step,
  flowDefinition,
  producerStepId,
  outputs,
}: {
  step: FlowStep;
  flowDefinition: FlowDefinition;
  /** The id of the completed step's definition. */
  producerStepId: string;
  outputs: StepOutput[];
}) => {
  if (step.kind === "action") {
    const { inputs } = getStepDefinitionFromFlowDefinition({
      step,
      flowDefinition,
    });

    for (const [inputName, source] of Object.entries(inputs)) {
      if (source.kind !== "step-output" || source.stepId !== producerStepId) {
        continue;
      }

      const matchingOutput = outputs.find(
        ({ outputName }) => outputName === source.outputName,
      );

      if (!matchingOutput) {
        /* The output is optional, and the step didn't produce it. */
        continue;
      }

      // eslint-disable-next-line no-param-reassign -- a run's steps hold its state as it runs
      step.inputs = [
        ...(step.inputs ?? []),
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
      step,
      flowDefinition,
    });

    if (over.kind === "step-output" && over.stepId === producerStepId) {
      const matchingOutput = outputs.find(
        ({ outputName }) => outputName === over.outputName,
      );

      if (matchingOutput) {
        // eslint-disable-next-line no-param-reassign -- a run's steps hold its state as it runs
        step.over = matchingOutput.payload as ArrayPayload;
      }
    }
  }
};

/**
 * Passes the outputs of a step that has just completed to the unprocessed steps that consume them, and
 * collects them into the for-each step it's a branch of, if any.
 */
export const passOutputsToUnprocessedSteps = (params: {
  stepsById: ReadonlyMap<string, FlowStep>;
  flowDefinition: FlowDefinition;
  stepId: string;
  outputs: StepOutput[];
  processedStepIds: ReadonlySet<string>;
}): Omit<Status<never>, "contents"> => {
  const { stepsById, flowDefinition, stepId, processedStepIds, outputs } =
    params;

  const { stepId: currentStepIdWithoutIndex, itemIndex: currentItemIndex } =
    parseStepRunId(stepId);

  if (currentItemIndex === undefined) {
    /* A step outside every for-each step can feed any step, including those in a for-each step's items. */
    for (const step of stepsById.values()) {
      if (!processedStepIds.has(step.stepId)) {
        passOutputsToStep({
          step,
          flowDefinition,
          producerStepId: currentStepIdWithoutIndex,
          outputs,
        });
      }
    }

    return { code: StatusCode.Ok };
  }

  const forEachStepDefinition = getEnclosingForEachStepDefinition(
    flowDefinition,
    currentStepIdWithoutIndex,
  );

  if (!forEachStepDefinition) {
    return { code: StatusCode.Ok };
  }

  /* A step in a for-each step's item only feeds the steps in the same item. */
  for (const stepDefinition of forEachStepDefinition.steps) {
    const step = stepsById.get(
      generateStepRunId(stepDefinition.stepId, currentItemIndex),
    );

    if (step && !processedStepIds.has(step.stepId)) {
      passOutputsToStep({
        step,
        flowDefinition,
        producerStepId: currentStepIdWithoutIndex,
        outputs,
      });
    }
  }

  const forEachStep = stepsById.get(forEachStepDefinition.stepId);
  const { collect } = forEachStepDefinition;

  if (
    forEachStep?.kind !== "for-each" ||
    !processedStepIds.has(forEachStep.stepId) ||
    collect.stepId !== currentStepIdWithoutIndex
  ) {
    return { code: StatusCode.Ok };
  }

  const collectedOutput = outputs.find(
    ({ outputName }) => outputName === collect.outputName,
  );

  if (!collectedOutput) {
    return {
      code: StatusCode.Internal,
      message: `Step ${stepId} did not produce output "${collect.outputName}", which for-each step ${forEachStep.stepId} collects`,
    };
  }

  forEachStep.branchValues = {
    ...forEachStep.branchValues,
    [currentItemIndex]: collectedOutput.payload.value,
  };

  // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the two pass each other's outputs on
  return completeForEachStep({
    stepsById,
    flowDefinition,
    forEachStep,
    processedStepIds,
  });
};

/**
 * The kind of the array a `forEach` step collects, worked out from the flow definition rather than from the
 * collected values, so that a `forEach` over no items still has one.
 */
const getCollectedPayloadKind = (
  flowDefinition: FlowDefinition,
  forEachStepDefinition: ForEachStepDefinition,
): PayloadKind | undefined =>
  createStepShapeResolver(flowDefinition).getStepOutputShape(
    forEachStepDefinition.collect.stepId,
    forEachStepDefinition.collect.outputName,
  )?.payloadKind;

/**
 * Once every branch of a for-each step has contributed its value, sets the step's collected output and passes
 * it to the steps that consume it. Values are collected in item order, whatever order the branches finish in:
 * array values are concatenated (stored arrays by reference, so that no stored payload is fetched here), and
 * singular values gathered.
 */
export const completeForEachStep = (params: {
  stepsById: ReadonlyMap<string, FlowStep>;
  flowDefinition: FlowDefinition;
  forEachStep: ForEachStep;
  processedStepIds: ReadonlySet<string>;
}): Omit<Status<never>, "contents"> => {
  const { stepsById, flowDefinition, forEachStep, processedStepIds } = params;

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

  const payloadKind = getCollectedPayloadKind(
    flowDefinition,
    forEachStepDefinition,
  );

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
    stepsById,
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
  stepsById: ReadonlyMap<string, FlowStep>;
  flowDefinition: FlowDefinition;
  stepId: string;
  processedStepIds: ReadonlySet<string>;
}): Omit<Status<never>, "contents"> => {
  const { stepsById, flowDefinition, stepId, processedStepIds } = params;

  const { stepId: stepIdWithoutIndex, itemIndex } = parseStepRunId(stepId);

  if (itemIndex === undefined) {
    return { code: StatusCode.Ok };
  }

  const forEachStepDefinition = getEnclosingForEachStepDefinition(
    flowDefinition,
    stepIdWithoutIndex,
  );

  const forEachStep =
    forEachStepDefinition && stepsById.get(forEachStepDefinition.stepId);

  if (
    forEachStep?.kind !== "for-each" ||
    forEachStepDefinition?.collect.stepId !== stepIdWithoutIndex
  ) {
    return { code: StatusCode.Ok };
  }

  forEachStep.branchValues = {
    ...forEachStep.branchValues,
    [itemIndex]: null,
  };

  return completeForEachStep({
    stepsById,
    flowDefinition,
    forEachStep,
    processedStepIds,
  });
};
