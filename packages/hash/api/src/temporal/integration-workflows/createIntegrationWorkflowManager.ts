import { Logger } from "@hashintel/hash-backend-utils/logger";
import { OrganizationWorkflowClient } from "../clients/OrganizationWorkflowClient";
import { TASK_QUEUES } from "./TASK_QUEUES";
import { manageIntegration } from "./workflows";

export function createIntegrationWorkflowManager(
  parentLogger: Logger,
  orgClient: OrganizationWorkflowClient,
) {
  const logger = parentLogger.child({ name: "IntegrationsWorkflow" });

  const hmm = (name: string) => (err: any) => logger.error({ name, err });

  return {
    async getIntegrationWorkflows() {
      const list = await orgClient.workflowClient.service
        .listWorkflowExecutions({
          namespace: orgClient.namespace,
        })
        .catch(hmm("list executions"));

      logger.debug({ message: "Workflow executions", a: list });

      // this.workflowClient.getHandle()

      return JSON.stringify(list?.toJSON(), null, 2);
    },
    async addNewIntegrationWorkflow(integrationName: string) {
      const handle = await orgClient.workflowClient.start(manageIntegration, {
        args: ["Temporal"], // type inference works! args: [name: string]
        taskQueue: TASK_QUEUES.mvpTestingHelloWorld,
        // in practice, use a meaningful business id, eg customerId or transactionId
        workflowId: `int-${
          orgClient.orgAccountId
        }-manage-${integrationName}-${Date.now().toString(36)}`,
      });

      logger.debug({
        message: "Created workflow execution",
        workflowId: handle.workflowId,
      });

      return JSON.stringify(handle, null, 2);
    },
  };
}
