import type {
  CreateHashEntityFromLinearData,
  ReadLinearTeamsWorkflow,
  SyncWebWorkflow,
  UpdateHashEntityFromLinearData,
  UpdateLinearDataWorkflow,
} from "@local/hash-backend-utils/temporal-integration-workflow-types";
import type { ActivityOptions } from "@temporalio/workflow";
import { proxyActivities } from "@temporalio/workflow";

import type { createLinearIntegrationActivities } from "./activities/linear-activities.js";
import { runFlowWorkflow } from "./workflows/run-flow-workflow.js";

const commonConfig: ActivityOptions = {
  startToCloseTimeout: "360 second",
  retry: {
    maximumAttempts: 3,
  },
};

const linearActivities =
  proxyActivities<ReturnType<typeof createLinearIntegrationActivities>>(
    commonConfig,
  );

export const syncLinearToWeb: SyncWebWorkflow = async (params) => {
  const { apiKey, webId, authentication, teamIds } = params;

  const organization = linearActivities
    .readLinearOrganization({ apiKey })
    .then((organizationEntity) =>
      linearActivities.createPartialEntities({
        authentication,
        webId,
        entities: [organizationEntity],
      }),
    );

  const users = linearActivities
    .readLinearUsers({ apiKey })
    .then((userEntities) =>
      linearActivities.createPartialEntities({
        authentication,
        webId,
        entities: userEntities,
      }),
    );

  const issues = teamIds.map((teamId) =>
    linearActivities.readAndCreateLinearIssues({
      apiKey,
      filter: { teamId },
      authentication,
      webId,
    }),
  );

  await Promise.all([organization, users, ...issues]);
};

export const createHashEntityFromLinearData: CreateHashEntityFromLinearData =
  async (params) => {
    await linearActivities.createHashEntityFromLinearData(params);
  };

export const updateHashEntityFromLinearData: UpdateHashEntityFromLinearData =
  async (params) => {
    await linearActivities.updateHashEntityFromLinearData(params);
  };

export const readLinearTeams: ReadLinearTeamsWorkflow = async ({ apiKey }) =>
  linearActivities.readLinearTeams({ apiKey });

export const updateLinearData: UpdateLinearDataWorkflow = async (params) =>
  linearActivities.updateLinearData(params);

export const runFlow = runFlowWorkflow;
