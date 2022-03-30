import { integrationStateQuery } from "./workflows";
import { IntegrationState } from "./integrationActivities";
import { AnyIntegrationDefinition, INTEGRATIONS } from "./INTEGRATIONS";
import { WorkflowHandleWithRunId } from "@temporalio/client";

export async function getIntegrationInfo(
  handle: WorkflowHandleWithRunId,
  { timeout = 400 } = {},
): Promise<null | IntegrationInfo> {
  // so, some of the workflows might not have anything for this query if you're switching up the
  // workflow over time. In that case, let's allow a sort of timeout
  const state = await Promise.race([
    delay(timeout),
    handle.query(integrationStateQuery),
  ]);

  if (state) {
    const definition = INTEGRATIONS[state.integrationName];
    if (definition) {
      return {
        workflowId: handle.workflowId,
        definition,
        state,
      };
    }
  }

  return null;
}
export type IntegrationInfo = {
  workflowId: string;
  state: IntegrationState;
  definition: AnyIntegrationDefinition;
};

/** helper */
function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
