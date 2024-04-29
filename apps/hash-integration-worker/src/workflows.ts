import type {
  CreateHashEntityFromLinearData,
  ReadLinearTeamsWorkflow,
  SyncWorkspaceWorkflow,
  UpdateHashEntityFromLinearData,
  UpdateLinearDataWorkflow,
} from "@local/hash-backend-utils/temporal-integration-workflow-types";
import type { ActivityOptions } from "@temporalio/workflow";
import { proxyActivities } from "@temporalio/workflow";

import type { createLinearIntegrationActivities } from "./linear-activities";

const commonConfig: ActivityOptions = {
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
};

const linearActivities =
  proxyActivities<ReturnType<typeof createLinearIntegrationActivities>>(
    commonConfig,
  );

export const syncWorkspace: SyncWorkspaceWorkflow = async (params) => {
  const { apiKey, workspaceOwnedById, authentication, teamIds } = params;

  const organization = linearActivities
    .readLinearOrganization({ apiKey })
    .then((organizationEntity) =>
      linearActivities.createPartialEntities({
        authentication,
        workspaceOwnedById,
        entities: [organizationEntity],
      }),
    );

  const users = linearActivities
    .readLinearUsers({ apiKey })
    .then((userEntities) =>
      linearActivities.createPartialEntities({
        authentication,
        workspaceOwnedById,
        entities: userEntities,
      }),
    );

  const issues = teamIds.map((teamId) =>
    linearActivities
      .readLinearIssues({ apiKey, filter: { teamId } })
      .then((issueEntities) =>
        linearActivities.createPartialEntities({
          authentication,
          workspaceOwnedById,
          entities: issueEntities,
        }),
      ),
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
