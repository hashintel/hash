import type {
  Next,
  proxySinks,
  WorkflowExecuteInput,
  WorkflowInboundCallsInterceptor,
  workflowInfo,
  WorkflowInterceptors,
} from "@temporalio/workflow";

import type { SentrySinks } from "../../sinks/sentry.js";

const { sentry } = proxySinks<SentrySinks>();

class SentryWorkflowInboundInterceptor
  implements WorkflowInboundCallsInterceptor
{
  constructor(public readonly workflowType: string) {}

  execute = async (
    input: WorkflowExecuteInput,
    next: Next<WorkflowInboundCallsInterceptor, "execute">,
  ): Promise<unknown> => {
    try {
      return await next(input);
    } catch (error) {
      sentry.captureException(error);
      throw error;
    }
  };
}

export const interceptors = (): WorkflowInterceptors => ({
  inbound: [new SentryWorkflowInboundInterceptor(workflowInfo().workflowType)],
});
