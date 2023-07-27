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

export const linearImport = async (params: {
  apiKey: string;
  ownedById: string;
  actorId: string;
  teamIds: string[];
}): Promise<void> => {
  const { apiKey, ownedById, actorId, teamIds } = params;

  const organization = linear
    .readOrganization({ apiKey })
    .then((organizationEntity) =>
      linear.createPartialEntities({
        ownedById,
        actorId,
        entities: [organizationEntity],
      }),
    );

  const users = linear.readUsers({ apiKey }).then((userEntities) =>
    linear.createPartialEntities({
      ownedById,
      actorId,
      entities: userEntities,
    }),
  );

  const issues = teamIds.map((teamId) =>
    linear.readIssues({ apiKey, filter: { teamId } }).then((issueEntities) =>
      linear.createPartialEntities({
        ownedById,
        actorId,
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
  await linear.createUsers({
    users: [params.user],
    ownedById: params.ownedById,
    actorId: params.actorId,
  });
};

export const createIssue = async (params: {
  issue: Issue;
  ownedById: string;
  actorId: string;
}): Promise<void> => {
  await linear.createIssues({
    issues: [params.issue],
    ownedById: params.ownedById,
    actorId: params.actorId,
  });
};

export const linearTeams = async ({
  apiKey,
}: {
  apiKey: string;
}): Promise<Team[]> => linear.readTeams({ apiKey });

export const updateLinearIssue = async (
  ...args: Parameters<typeof linear.updateIssue>
) => {
  await linear.updateIssue(...args);
};
