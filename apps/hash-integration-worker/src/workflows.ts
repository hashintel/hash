import {
  createGoogleOAuth2Client,
  getTokensForGoogleAccount,
} from "@local/hash-backend-utils/google";
import type {
  CreateHashEntityFromLinearData,
  ReadLinearTeamsWorkflow,
  SyncQueryToGoogleSheetWorkflow,
  SyncWorkspaceWorkflow,
  UpdateHashEntityFromLinearData,
  UpdateLinearDataWorkflow,
} from "@local/hash-backend-utils/temporal-integration-workflow-types";
import { createVaultClient } from "@local/hash-backend-utils/vault";
import { ActivityOptions, proxyActivities } from "@temporalio/workflow";

import * as googleActivityFunctions from "./google-activities";
import type { createGraphActivities } from "./graph-activities";
import type { createLinearIntegrationActivities } from "./linear-activities";

const commonConfig: ActivityOptions = {
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
};

const graphActivities =
  proxyActivities<ReturnType<typeof createGraphActivities>>(commonConfig);

const linearActivities =
  proxyActivities<ReturnType<typeof createLinearIntegrationActivities>>(
    commonConfig,
  );

const googleActivities =
  proxyActivities<typeof googleActivityFunctions>(commonConfig);

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

export const syncQueryToGoogleSheet: SyncQueryToGoogleSheetWorkflow = async ({
  authentication,
  queryEntityId,
  spreadsheetId,
}) => {
  const vaultClient = createVaultClient();
  if (!vaultClient) {
    throw new Error("Vault client not configured");
  }

  const tokens = await getTokensForGoogleAccount({
    userAccountId: req.user.accountId,
    googleAccountEntityId: googleAccount.metadata.recordId.entityId,
    vaultClient: req.context.vaultClient,
  });

  const errorMessage = `Could not get tokens for Google account with id ${googleAccountId} for user ${req.user.accountId}.`;

  // @todo flag user secret entity is invalid and create notification for user
  if (!tokens) {
    res.status(500).send({
      error: errorMessage,
    });
    return;
  }

  const googleOAuth2Client = createGoogleOAuth2Client();
  const sheetsClient = google.sheets({
    auth: googleOAuth2Client,
    version: "v4",
  });

  googleOAuth2Client.setCredentials(tokens);

  const entitySubgraph =
    await graphActivities.getSubgraphFromBlockProtocolQueryEntity({
      authentication,
      queryEntityId,
    });

  await googleActivities.writeSubgraphToGoogleSheet({
    entitySubgraph,
    sheetsClient,
    spreadsheetId,
  });
};
