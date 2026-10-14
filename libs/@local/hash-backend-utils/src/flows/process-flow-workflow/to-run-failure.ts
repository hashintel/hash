import {
  ApplicationFailure,
  LocalActivityDoBackoff,
  TemporalFailure,
  WorkflowError,
} from "@temporalio/workflow";

/**
 * An error thrown while running a flow, as a failure of the run. Temporal retries a workflow task that throws a plain
 * error, so the run would stay running. Temporal's own failures and errors pass through unchanged.
 */
export const toRunFailure = (error: unknown) =>
  error instanceof TemporalFailure ||
  error instanceof WorkflowError ||
  error instanceof LocalActivityDoBackoff
    ? error
    : ApplicationFailure.create({
        message: error instanceof Error ? error.message : String(error),
        nonRetryable: true,
        cause: error instanceof Error ? error : undefined,
      });
