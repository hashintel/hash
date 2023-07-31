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
  const { apiKey, workspaceAccountId, actorId, teamIds } = params;

  const organization = linear
    .readLinearOrganization({ apiKey })
    .then((organizationEntity) =>
      linear.createPartialEntities({
        workspaceAccountId,
        actorId,
        entities: [organizationEntity],
      }),
    );

  const users = linear.readLinearUsers({ apiKey }).then((userEntities) =>
    linear.createPartialEntities({
      workspaceAccountId,
      actorId,
      entities: userEntities,
    }),
  );

  const issues = teamIds.map((teamId) =>
    linear
      .readLinearIssues({ apiKey, filter: { teamId } })
      .then((issueEntities) =>
        linear.createPartialEntities({
          workspaceAccountId,
          actorId,
          entities: issueEntities,
        }),
      ),
  );

  await Promise.all([organization, users, ...issues]);
};

export const createHashUser: CreateHashUserWorkflow = async (params) => {
  await linear.createHashUser({
    user: params.payload,
    workspaceAccountId: params.ownedById,
    actorId: params.actorId,
  });
};

export const updateHashUser: UpdateHashUserWorkflow = async (params) =>
  linear.updateHashUser({
    user: params.payload,
    actorId: params.actorId,
  });

export const createHashIssue: CreateHashIssueWorkflow = async (params) => {
  await linear.createHashIssue({
    issue: params.payload,
    workspaceAccountId: params.ownedById,
    actorId: params.actorId,
  });
};

export const updateHashIssue: UpdateHashIssueWorkflow = async (params) =>
  linear.updateHashIssue({
    issue: params.payload,
    actorId: params.actorId,
  });

export const readLinearTeams: ReadLinearTeamsWorkflow = async ({ apiKey }) =>
  linear.readLinearTeams({ apiKey });

export const updateLinearIssue: UpdateLinearIssueWorkflow = async (params) => {
  return await linear.updateLinearIssue(params);
};
