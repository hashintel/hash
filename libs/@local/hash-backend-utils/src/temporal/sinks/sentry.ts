import type { ExclusiveEventHintOrCaptureContext } from "@sentry/core/types/utils/prepareEvent";
import * as Sentry from "@sentry/node";
import type { CaptureContext, SeverityLevel } from "@sentry/types";
import type { InjectedSinks } from "@temporalio/worker";
import type { Sinks, WorkflowInfo } from "@temporalio/workflow";

export interface SentrySinks extends Sinks {
  sentry: {
    captureMessage(
      message: string,
      captureContext?: CaptureContext | SeverityLevel,
    ): void;
    captureException(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exception: any,
      hint?: ExclusiveEventHintOrCaptureContext,
    ): void;
  };
}

const setTemporalScope = (scope: Sentry.Scope, workflowInfo: WorkflowInfo) => {
  scope.setTransactionName(workflowInfo.workflowType);
  scope.setTags({
    workflowNamespace: workflowInfo.namespace,
    queue: workflowInfo.taskQueue,
  });
  scope.setExtras({
    workflowId: workflowInfo.workflowId,
    runId: workflowInfo.runId,
    historyLength: workflowInfo.historyLength,
    firstExecutionRunId: workflowInfo.firstExecutionRunId,
    continuedFromExecutionRunId: workflowInfo.continuedFromExecutionRunId,
    startTime: workflowInfo.startTime,
    runStartTime: workflowInfo.runStartTime,
    executionTimeout: workflowInfo.executionTimeoutMs,
    executionExpirationTime: workflowInfo.executionExpirationTime,
    runTimeout: workflowInfo.runTimeoutMs,
    taskTimeout: workflowInfo.taskTimeoutMs,
    attempt: workflowInfo.attempt,
    cronSchedule: workflowInfo.cronSchedule,
    cronScheduleToScheduleInterval: workflowInfo.cronScheduleToScheduleInterval,
    ...workflowInfo.memo,
  });
};

export const sentrySinks = (): InjectedSinks<SentrySinks> => ({
  sentry: {
    captureMessage: {
      fn(workflowInfo, message, captureContext) {
        Sentry.withScope((scope) => {
          setTemporalScope(scope, workflowInfo);
          Sentry.captureMessage(message, captureContext);
        });
      },
      callDuringReplay: false,
    },
    captureException: {
      fn(workflowInfo, exception, hint) {
        Sentry.withScope((scope) => {
          setTemporalScope(scope, workflowInfo);
          Sentry.captureException(exception, hint);
        });
      },
      callDuringReplay: false,
    },
  },
});
