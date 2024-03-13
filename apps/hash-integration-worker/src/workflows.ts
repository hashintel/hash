import type {
  CreateHashEntityFromLinearData,
  ReadLinearTeamsWorkflow,
  SyncWorkspaceWorkflow,
  UpdateHashEntityFromLinearData,
  UpdateLinearDataWorkflow,
} from "@local/hash-backend-utils/temporal-workflow-types";
import { proxyActivities } from "@temporalio/workflow";

import type { createLinearIntegrationActivities } from "./activities";

const linear = proxyActivities<
  ReturnType<typeof createLinearIntegrationActivities>
>({
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const syncWorkspace: SyncWorkspaceWorkflow = async (params) => {
  const { apiKey, workspaceOwnedById, authentication, teamIds } = params;

  const organization = linear
    .readLinearOrganization({ apiKey })
    .then((organizationEntity) =>
      linear.createPartialEntities({
        authentication,
        workspaceOwnedById,
        entities: [organizationEntity],
      }),
    );

  const users = linear.readLinearUsers({ apiKey }).then((userEntities) =>
    linear.createPartialEntities({
      authentication,
      workspaceOwnedById,
      entities: userEntities,
    }),
  );

  const issues = teamIds.map((teamId) =>
    linear
      .readLinearIssues({ apiKey, filter: { teamId } })
      .then((issueEntities) =>
        linear.createPartialEntities({
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
    await linear.createHashEntityFromLinearData(params);
  };

export const updateHashEntityFromLinearData: UpdateHashEntityFromLinearData =
  async (params) => {
    await linear.updateHashEntityFromLinearData(params);
  };

export const readLinearTeams: ReadLinearTeamsWorkflow = async ({ apiKey }) =>
  linear.readLinearTeams({ apiKey });

export const updateLinearData: UpdateLinearDataWorkflow = async (params) =>
  linear.updateLinearData(params);
