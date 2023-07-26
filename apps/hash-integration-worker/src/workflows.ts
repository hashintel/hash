import { Issue, Team, User } from "@linear/sdk";
import { proxyActivities } from "@temporalio/workflow";

import { createLinearIntegrationActivities } from "./activities";

export const linear = proxyActivities<
  ReturnType<typeof createLinearIntegrationActivities>
>({
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const linearImport = async (params: {
  ownedById: string;
  actorId: string;
  teamIds: string[];
}): Promise<void> => {
  const organization = linear.readOrganization().then((organizationEntity) =>
    linear.createPartialEntities({
      ownedById: params.ownedById,
      actorId: params.actorId,
      entities: [organizationEntity],
    }),
  );

  const users = linear.readUsers().then((userEntities) =>
    linear.createPartialEntities({
      ownedById: params.ownedById,
      actorId: params.actorId,
      entities: userEntities,
    }),
  );

  const issues = params.teamIds.map((teamId) =>
    linear.readIssues({ teamId }).then((issueEntities) =>
      linear.createPartialEntities({
        ownedById: params.ownedById,
        actorId: params.actorId,
        entities: issueEntities,
      }),
    ),
  );

  await Promise.all([organization, users, ...issues]);
};

export const createUser = async (params: {
  user: User;
  ownedById: string;
  actorId: string;
}): Promise<void> => {
  await linear.createUser({
    user: params.user,
    ownedById: params.ownedById,
    actorId: params.actorId,
  });
};

export const updateUser = async (params: {
  user: User;
  actorId: string;
}): Promise<void> => linear.updateUser(params);

export const createIssue = async (params: {
  issue: Issue;
  ownedById: string;
  actorId: string;
}): Promise<void> => {
  await linear.createIssue({
    issue: params.issue,
    ownedById: params.ownedById,
    actorId: params.actorId,
  });
};

export const updateIssue = async (params: {
  issue: Issue;
  actorId: string;
}): Promise<void> => linear.updateIssue(params);

export const linearTeams = async (): Promise<Team[]> => linear.readTeams();
