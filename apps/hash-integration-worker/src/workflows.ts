import { Issue, User } from "@linear/sdk";
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

export const syncWorkspace = async (params: {
  apiKey: string;
  workspaceAccountId: string;
  actorId: string;
  teamIds: string[];
}): Promise<string | undefined> => {
  const { apiKey, workspaceAccountId, actorId, teamIds } = params;

  const organization = linear
    .readOrganization({ apiKey })
    .then((organizationEntity) =>
      linear.createPartialEntities({
        workspaceAccountId,
        actorId,
        entities: [organizationEntity],
      }),
    );

  const users = linear.readUsers({ apiKey }).then((userEntities) =>
    linear.createPartialEntities({
      workspaceAccountId,
      actorId,
      entities: userEntities,
    }),
  );

  const issues = teamIds.map((teamId) =>
    linear.readIssues({ apiKey, filter: { teamId } }).then((issueEntities) =>
      linear.createPartialEntities({
        workspaceAccountId,
        actorId,
        entities: issueEntities,
      }),
    ),
  );

  try {
    await Promise.all([organization, users, ...issues]);
  } catch (error) {
    return error instanceof Error ? error.message : "Unknown error";
  }
  return undefined;
};

export const createUser = async (params: {
  payload: User;
  ownedById: string;
  actorId: string;
}): Promise<string | undefined> => {
  return linear.createUser({
    user: params.payload,
    workspaceAccountId: params.ownedById,
    actorId: params.actorId,
  });
};

export const updateUser = async (params: {
  payload: User;
  actorId: string;
}): Promise<string | undefined> =>
  linear.updateUser({
    user: params.payload,
    actorId: params.actorId,
  });

export const createIssue = async (params: {
  payload: Issue;
  ownedById: string;
  actorId: string;
}): Promise<string | undefined> =>
  linear.createIssue({
    issue: params.payload,
    workspaceAccountId: params.ownedById,
    actorId: params.actorId,
  });

export const updateIssue = async (params: {
  payload: Issue;
  actorId: string;
}): Promise<string | undefined> =>
  linear.updateIssue({
    issue: params.payload,
    actorId: params.actorId,
  });

export const updateLinearIssue = async (
  ...args: Parameters<typeof linear.updateIssue>
): Promise<string | undefined> => linear.updateIssue(...args);
