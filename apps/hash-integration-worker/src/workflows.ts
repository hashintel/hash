import {
  CreateHashEntityFromLinearData,
  ReadLinearTeamsWorkflow,
  SyncQueryToGoogleSheetWorkflow,
  SyncWorkspaceWorkflow,
  UpdateHashEntityFromLinearData,
  UpdateLinearDataWorkflow,
} from "@local/hash-backend-utils/temporal-integration-workflow-types";
import { ActivityOptions, proxyActivities } from "@temporalio/workflow";

import * as googleActivities from "./google-activities";
import { createGraphActivities } from "./graph-activities";
import { createLinearIntegrationActivities } from "./linear-activities";

const commonConfig: ActivityOptions = {
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
};

const graph =
  proxyActivities<ReturnType<typeof createGraphActivities>>(commonConfig);

const linear =
  proxyActivities<ReturnType<typeof createLinearIntegrationActivities>>(
    commonConfig,
  );

const google = proxyActivities<typeof googleActivities>(commonConfig);

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

export const syncQueryToGoogleSheet = async ({
  accessToken,
  authentication,
  queryEntityId,
  spreadsheetId,
}): SyncQueryToGoogleSheetWorkflow => {
  const entitySubgraph = await graph.getSubgraphFromBlockProtocolFilter({
    authentication,
  });
};
