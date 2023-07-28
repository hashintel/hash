import { Issue, Team, User } from "@linear/sdk";
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
}): Promise<void> => {
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

  await Promise.all([organization, users, ...issues]);
};

export const createUser = async (params: {
  payload: User;
  ownedById: string;
  actorId: string;
}): Promise<void> => {
  await linear.createUser({
    user: params.payload,
    ownedById: params.ownedById,
    actorId: params.actorId,
  });
};

export const updateUser = async (params: {
  payload: User;
  actorId: string;
}): Promise<void> =>
  linear.updateUser({
    user: params.payload,
    actorId: params.actorId,
  });

export const createIssue = async (params: {
  payload: Issue;
  ownedById: string;
  actorId: string;
}): Promise<void> => {
  await linear.createIssue({
    issue: params.payload,
    ownedById: params.ownedById,
    actorId: params.actorId,
  });
};

export const updateIssue = async (params: {
  payload: Issue;
  actorId: string;
}): Promise<void> =>
  linear.updateIssue({
    issue: params.payload,
    actorId: params.actorId,
  });

export const linearTeams = async ({
  apiKey,
}: {
  apiKey: string;
}): Promise<Team[]> => linear.readTeams({ apiKey });

export const updateLinearIssue = async (
  ...args: Parameters<typeof linear.updateLinearIssue>
) => {
  await linear.updateLinearIssue(...args);
};
