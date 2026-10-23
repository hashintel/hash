import proto from "@temporalio/proto";

import { appendCollectedValue } from "@local/hash-isomorphic-utils/flows/stored-payload-refs";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";

import { parseHistoryItemPayload } from "../../temporal/parse-history-item-payload.js";
import { getCollectedPayloadKind } from "../process-flow-workflow/pass-outputs-to-unprocessed-steps.js";

import type { getFlowDefinitionActivity } from "../process-flow-workflow/common-activities/get-flow-definition-activity.js";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type {
  ArrayPayload,
  FlowDefinition,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";

type IHistoryEvent = proto.temporal.api.history.v1.IHistoryEvent;

const { EventType } = proto.temporal.api.enums.v1;

/** The flow definition the run's workflow got when it started. */
const getFlowDefinitionFromHistory = (
  history: IHistoryEvent[],
): FlowDefinition => {
  const scheduledEventId = history.find(
    (event) =>
      event.activityTaskScheduledEventAttributes?.activityType?.name ===
      "getFlowDefinitionActivity",
  )?.eventId;

  const completedEvent = history.find(
    (event) =>
      event.eventType === EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED &&
      String(event.activityTaskCompletedEventAttributes?.scheduledEventId) ===
        String(scheduledEventId),
  );

  const [result] =
    (parseHistoryItemPayload(
      completedEvent?.activityTaskCompletedEventAttributes?.result,
    ) as [Awaited<ReturnType<typeof getFlowDefinitionActivity>>] | undefined) ??
    [];

  if (scheduledEventId === undefined || result?.status !== "ok") {
    throw new Error("The run's history has no flow definition");
  }

  return result.flowDefinition;
};

/**
 * The outputs a completed run's workflow returns, from its history and its events: each output of its definition the
 * run produced, from the last successful attempt of the step that produces it, or for a `forEach` step, collected
 * from each of its items in order.
 */
export const getFlowOutputs = ({
  history,
  events,
}: {
  history: IHistoryEvent[];
  events: FlowRunEvent[];
}): StepOutput[] => {
  const flowDefinition = getFlowDefinitionFromHistory(history);
  const stepDefinitions = getAllStepDefinitionsInFlowDefinition(flowDefinition);

  const outputsByStepRun = new Map<string, StepOutput[]>();
  const itemCountsByForEachStepId = new Map<string, number>();

  for (const event of events) {
    if (event.kind === "attemptSucceeded") {
      outputsByStepRun.set(
        JSON.stringify([event.stepRun.stepId, ...event.stepRun.itemPath]),
        event.outputs,
      );
    } else if (event.kind === "forEachStarted") {
      itemCountsByForEachStepId.set(event.stepRun.stepId, event.itemCount);
    }
  }

  const findOutput = (stepId: string, itemPath: number[], outputName: string) =>
    outputsByStepRun
      .get(JSON.stringify([stepId, ...itemPath]))
      ?.find((output) => output.outputName === outputName);

  return flowDefinition.outputs.flatMap(({ name, stepId, outputName }) => {
    const stepDefinition = stepDefinitions.find(
      (step) => step.stepId === stepId,
    );
    const itemCount = itemCountsByForEachStepId.get(stepId);

    if (stepDefinition?.kind !== "for-each") {
      const output = findOutput(stepId, [], outputName);

      return output ? [{ outputName: name, payload: output.payload }] : [];
    }

    const payloadKind = getCollectedPayloadKind(flowDefinition, stepDefinition);

    if (itemCount === undefined || !payloadKind) {
      return [];
    }

    let collectedValue: Parameters<typeof appendCollectedValue>[0];

    for (let index = 0; index < itemCount; index++) {
      const branchOutput = findOutput(
        stepDefinition.collect.stepId,
        [index],
        stepDefinition.collect.outputName,
      );

      /* A branch whose collected step was skipped contributes nothing. */
      if (branchOutput) {
        collectedValue = appendCollectedValue(
          collectedValue,
          branchOutput.payload.value,
        );
      }
    }

    return [
      {
        outputName: name,
        payload: {
          kind: payloadKind,
          value: collectedValue ?? [],
        } as ArrayPayload,
      },
    ];
  });
};
