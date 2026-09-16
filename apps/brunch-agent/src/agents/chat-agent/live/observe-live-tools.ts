import type { LiveToolBroadcaster } from "./live-tool-broadcaster.ts";
import type {
  FlueEventContext,
  FlueObservation,
  FlueObservationSubscriber,
} from "@flue/runtime";

const callKey = (event: {
  readonly instanceId: string;
  readonly submissionId: string;
  readonly toolCallId: string;
  readonly turnId: string;
}): string =>
  JSON.stringify([
    event.instanceId,
    event.submissionId,
    event.turnId,
    event.toolCallId,
  ]);

const scopedCorrelation = (
  event: FlueObservation,
  context: FlueEventContext,
  agentName: string,
):
  | {
      readonly instanceId: string;
      readonly submissionId: string;
    }
  | undefined => {
  if (
    (event.agentName ?? context.agentName) !== agentName ||
    event.submissionId === undefined
  ) {
    return undefined;
  }
  const instanceId = event.instanceId ?? context.id;
  return instanceId.length === 0
    ? undefined
    : { instanceId, submissionId: event.submissionId };
};

export const createLiveToolObserver = (
  broadcaster: LiveToolBroadcaster,
  agentName: string,
): {
  readonly dispose: () => void;
  readonly observe: FlueObservationSubscriber;
} => {
  const startedCalls = new Set<string>();

  const discardTurn = (correlation: {
    readonly instanceId: string;
    readonly submissionId: string;
    readonly turnId: string;
  }): void => {
    const prefix = JSON.stringify([
      correlation.instanceId,
      correlation.submissionId,
      correlation.turnId,
    ]).slice(0, -1);
    for (const key of startedCalls) {
      if (key.startsWith(`${prefix},`)) startedCalls.delete(key);
    }
  };

  const discardSubmission = (correlation: {
    readonly instanceId: string;
    readonly submissionId: string;
  }): void => {
    const prefix = JSON.stringify([
      correlation.instanceId,
      correlation.submissionId,
    ]).slice(0, -1);
    for (const key of startedCalls) {
      if (key.startsWith(`${prefix},`)) startedCalls.delete(key);
    }
  };

  return {
    dispose: () => startedCalls.clear(),
    observe: (event, context) => {
      const correlation = scopedCorrelation(event, context, agentName);
      if (correlation === undefined) return;

      switch (event.type) {
        case "toolcall_delta": {
          if (event.turnId === undefined) return;
          const input = {
            ...correlation,
            turnId: event.turnId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          };
          const key = callKey(input);
          if (!startedCalls.has(key)) {
            startedCalls.add(key);
            broadcaster.publish({ ...input, kind: "tool-input-start" });
          }
          broadcaster.publish({
            ...input,
            kind: "tool-input-delta",
            inputTextDelta: event.argumentTextDelta,
          });
          return;
        }
        case "turn": {
          const input = { ...correlation, turnId: event.turnId };
          broadcaster.publish({ ...input, kind: "turn-finished" });
          discardTurn(input);
          return;
        }
        case "submission_settled":
          broadcaster.publish({
            ...correlation,
            kind: "submission-finished",
            outcome: event.outcome,
          });
          discardSubmission(correlation);
          return;
        default:
          return;
      }
    },
  };
};
