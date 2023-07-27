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

export const linearTeams = async (): Promise<Team[]> => linear.readTeams();
