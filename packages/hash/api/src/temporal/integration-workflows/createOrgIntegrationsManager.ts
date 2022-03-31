import { Logger } from "@hashintel/hash-backend-utils/logger";
import { WorkflowHandle, WorkflowHandleWithRunId } from "@temporalio/client";
import { OrganizationWorkflowClient } from "../clients/OrganizationWorkflowClient";
import { TASK_QUEUES } from "./TASK_QUEUES";
import * as workflows from "./workflows";
import { integrationStateQuery } from "./workflows";
import { IntegrationState } from "./integrationActivities";
import { AnyIntegrationDefinition, INTEGRATIONS } from "./INTEGRATIONS";

/** The org integrations workflow manager */
export interface OrgIntegrationsManager {
  listIntegrationWorkflows(): Promise<IntegrationInfo[]>;
  expectIntegrationInfo(integrationId: string): Promise<IntegrationInfo>;
  addNewIntegrationWorkflow(integrationName: string): Promise<{
    info: IntegrationInfo;
  }>;
  integration(info: IntegrationInfo): {
    setEnabled(enable: boolean): Promise<void>;
    configureFields(
      fields: Array<{ fieldKey: string; value: string | undefined }>,
    ): Promise<void>;
    performIntegration(): Promise<void>;
  };
}

export function createOrgIntegrationsManager(
  parentLogger: Logger,
  orgClient: OrganizationWorkflowClient,
): OrgIntegrationsManager {
  const logger = parentLogger.child({ name: "IntegrationsWorkflow" });

  return {
    async listIntegrationWorkflows() {
      const { executions } =
        await orgClient.workflowClient.service.listOpenWorkflowExecutions({
          namespace: orgClient.namespace,
        });

      return (
        await Promise.all(
          executions.map(async (exec): Promise<IntegrationInfo | null> => {
            const workflowId = exec.execution?.workflowId;
            const runId = exec.execution?.runId;
            if (
              exec.type?.name === workflows.manageIntegration.name &&
              workflowId &&
              runId
            ) {
              const handle = orgClient.workflowClient.getHandle(
                workflowId,
                runId,
              );

              return expectIntegrationInfoFromHandle(handle).catch(() => null);
            }

            return null;
          }),
        )
      ).filter(
        // ugh... TypeScript, please get better at inferring for filter please!
        (infoOrNull): infoOrNull is IntegrationInfo => infoOrNull != null,
      );
    },
    async addNewIntegrationWorkflow(integrationName: string) {
      const workflowId = `int-${
        orgClient.orgEntityId
      }-manage-${integrationName}-${Date.now().toString(36)}`;
      const handle = await orgClient.workflowClient.start(
        workflows.manageIntegration,
        {
          args: [integrationName], // type inference works! args: [integrationName: string]
          taskQueue: TASK_QUEUES.mvpTestingHelloWorld,
          workflowId,
        },
      );

      logger.debug({
        message: "Created workflow execution",
        workflowId: handle.workflowId,
      });

      const integrationInfo = await expectIntegrationInfoFromHandle(handle, {
        timeout: 5000,
      });

      return {
        info: integrationInfo,
      };
    },
    async expectIntegrationInfo(
      integrationId: string,
    ): Promise<IntegrationInfo> {
      const handle = orgClient.workflowClient.getHandle(integrationId);
      return expectIntegrationInfoFromHandle(handle);
    },
    integration(info) {
      return {
        async configureFields(fields) {
          await info.handle.signal(workflows.configureIntegrationSignal, {
            type: "configureFields",
            configureFields: {
              fields: Object.fromEntries(
                fields.map((a) => [a.fieldKey, a.value]),
              ),
              // "now" (created before the worker actually gets the value)
              updateAt: new Date(),
            },
          });
        },
        async performIntegration() {
          await info.handle.signal(workflows.startIntegrationSignal);
        },
        async setEnabled(enabled) {
          await info.handle.signal(workflows.configureIntegrationSignal, {
            type: "enable",
            enable: enabled,
          });
        },
      };
    },
  };
}

async function expectIntegrationInfoFromHandle(
  handle: WorkflowHandle,
  { timeout = 400 } = {},
): Promise<IntegrationInfo> {
  // so, some of the workflows might not have anything for this query if you're switching up the
  // workflow over time. In that case, let's allow a sort of timeout
  // This can also time-out if you don't have any workers running.
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
        handle,
      };
    } else {
      return Promise.reject(
        new Error(
          `Failed to find integration definition with name "${state.integrationName}" for workflow "${handle.workflowId}"`,
        ),
      );
    }
  }

  return Promise.reject(
    new Error(
      `Failed to find integration being managed by workflow "${handle.workflowId}"`,
    ),
  );
}
export type IntegrationInfo = {
  workflowId: string;
  state: IntegrationState;
  definition: AnyIntegrationDefinition;
  handle: WorkflowHandle;
};

/** helper */
function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
