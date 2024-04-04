import * as Sentry from "@sentry/node";
import type { InjectedSinks } from "@temporalio/worker";
import type { Sinks, WorkflowInfo } from "@temporalio/workflow";

export interface SentrySinks extends Sinks {
  sentry: {
    captureMessage: typeof Sentry.captureMessage;
    captureException: typeof Sentry.captureException;
  };
}

const setTemporalScope = (scope: Sentry.Scope, workflowInfo: WorkflowInfo) => {
  scope.setTags({
    workflow: workflowInfo.workflowType,
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
      fn: (workflowInfo, ...args) =>
        Sentry.withScope((scope) => {
          setTemporalScope(scope, workflowInfo);
          Sentry.captureMessage(...args);
        }),
      callDuringReplay: false,
    },
    captureException: {
      fn: (workflowInfo, ...args) =>
        Sentry.withScope((scope) => {
          setTemporalScope(scope, workflowInfo);
          Sentry.captureException(...args);
        }),
      callDuringReplay: false,
    },
  },
});
