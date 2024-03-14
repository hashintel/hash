import type {
  CreateHashEntityFromLinearData,
  ReadLinearTeamsWorkflow,
  SyncQueryToGoogleSheetWorkflow,
  SyncWorkspaceWorkflow,
  UpdateHashEntityFromLinearData,
  UpdateLinearDataWorkflow,
} from "@local/hash-backend-utils/temporal-integration-workflow-types";
import type { ActivityOptions } from "@temporalio/workflow";
import { proxyActivities } from "@temporalio/workflow";

import type { createGoogleActivities } from "./google-activities";
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
  proxyActivities<ReturnType<typeof createGoogleActivities>>(commonConfig);

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
  integrationEntityId,
  userAccountId,
}) => {
  const { googleAccountEntity, integrationEntity, queryEntity } =
    await googleActivities.getGoogleSheetsIntegrationEntities({
      authentication: { actorId: userAccountId },
      integrationEntityId,
    });

  if (!googleAccountEntity || !integrationEntity || !queryEntity) {
    throw new Error(
      `Missing Google entities for integration with id ${integrationEntityId}`,
    );
  }

  const entitySubgraph =
    await graphActivities.getSubgraphFromBlockProtocolQueryEntity({
      authentication: { actorId: userAccountId },
      queryEntityId: queryEntity.metadata.recordId.entityId,
    });

  await googleActivities.writeSubgraphToGoogleSheet({
    audience: integrationEntity.properties[
      "https://hash.ai/@hash/types/property-type/data-audience/"
    ] as "human" | "machine",
    entitySubgraph,
    googleAccountEntityId: googleAccountEntity.metadata.recordId.entityId,
    spreadsheetId:
      integrationEntity.properties[
        "https://hash.ai/@hash/types/property-type/file-id/"
      ],
    userAccountId,
  });
};
