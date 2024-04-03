import * as Sentry from "@sentry/node";
import type { Context } from "@temporalio/activity";
import type { ActivityInboundCallsInterceptor } from "@temporalio/worker";
import type { ActivityExecuteInput } from "@temporalio/worker/src/interceptors";
import type { Next } from "@temporalio/workflow";

export class SentryActivityInboundInterceptor
  implements ActivityInboundCallsInterceptor
{
  constructor(public readonly context: Context) {
    this.context = context;
  }

  execute = async (
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">,
  ): Promise<unknown> =>
    Sentry.startSpan(
      {
        name: this.context.info.activityType,
      },
      async (_span) => {
        const scope = Sentry.getCurrentScope();
        scope.setTags({
          activityNamespace: this.context.info.activityNamespace,
          workflowNamespace: this.context.info.workflowNamespace,
          workflow: this.context.info.workflowType,
          queue: this.context.info.taskQueue,
        });

        scope.setExtras({
          activityId: this.context.info.activityId,
          isLocal: this.context.info.isLocal,
          workflowId: this.context.info.workflowExecution.workflowId,
          runId: this.context.info.workflowExecution.runId,
          attempt: this.context.info.attempt,
          scheduledTimestamp: this.context.info.scheduledTimestampMs,
          scheduleToCloseTimeout: this.context.info.scheduleToCloseTimeoutMs,
          startToCloseTimeout: this.context.info.startToCloseTimeoutMs,
          heartbeatTimeout: this.context.info.heartbeatTimeoutMs,
        });

        try {
          return await next(input);
        } catch (err) {
          Sentry.captureException(err);
          throw err;
        }
      },
    );
}
