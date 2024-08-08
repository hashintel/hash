import type {
  Next,
  WorkflowExecuteInput,
  WorkflowInboundCallsInterceptor,
  WorkflowInterceptors,
} from "@temporalio/workflow";
import { proxySinks, workflowInfo } from "@temporalio/workflow";

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
    } catch (err) {
      sentry.captureException(err);
      throw err;
    }
  };
}

export const interceptors = (): WorkflowInterceptors => ({
  inbound: [new SentryWorkflowInboundInterceptor(workflowInfo().workflowType)],
});
