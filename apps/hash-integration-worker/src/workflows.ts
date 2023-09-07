import {
  CreateHashIssueWorkflow,
  CreateHashUserWorkflow,
  ReadLinearTeamsWorkflow,
  SyncWorkspaceWorkflow,
  UpdateHashIssueWorkflow,
  UpdateHashUserWorkflow,
  UpdateLinearIssueWorkflow,
} from "@local/hash-backend-utils/temporal-workflow-types";
import { proxyActivities } from "@temporalio/workflow";

import { createLinearIntegrationActivities } from "./activities";

const linear = proxyActivities<
  ReturnType<typeof createLinearIntegrationActivities>
>({
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const syncWorkspace: SyncWorkspaceWorkflow = async (params) => {
  const { apiKey, workspaceAccountId, authentication, teamIds } = params;

  const organization = linear
    .readLinearOrganization({ apiKey })
    .then((organizationEntity) =>
      linear.createPartialEntities({
        authentication,
        workspaceAccountId,
        entities: [organizationEntity],
      }),
    );

  const users = linear.readLinearUsers({ apiKey }).then((userEntities) =>
    linear.createPartialEntities({
      authentication,
      workspaceAccountId,
      entities: userEntities,
    }),
  );

  const issues = teamIds.map((teamId) =>
    linear
      .readLinearIssues({ apiKey, filter: { teamId } })
      .then((issueEntities) =>
        linear.createPartialEntities({
          authentication,
          workspaceAccountId,
          entities: issueEntities,
        }),
      ),
  );

  await Promise.all([organization, users, ...issues]);
};

export const createHashUser: CreateHashUserWorkflow = async (params) => {
  await linear.createHashUser({
    authentication: params.authentication,
    user: params.payload,
    workspaceAccountId: params.ownedById,
  });
};

export const updateHashUser: UpdateHashUserWorkflow = async (params) =>
  linear.updateHashUser({
    authentication: params.authentication,
    user: params.payload,
  });

export const createHashIssue: CreateHashIssueWorkflow = async (params) => {
  await linear.createHashIssue({
    authentication: params.authentication,
    issue: params.payload,
    workspaceAccountId: params.ownedById,
  });
};

export const updateHashIssue: UpdateHashIssueWorkflow = async (params) =>
  linear.updateHashIssue({
    authentication: params.authentication,
    issue: params.payload,
  });

export const readLinearTeams: ReadLinearTeamsWorkflow = async ({ apiKey }) =>
  linear.readLinearTeams({ apiKey });

export const updateLinearIssue: UpdateLinearIssueWorkflow = async (params) => {
  await linear.updateLinearIssue(params);
};
