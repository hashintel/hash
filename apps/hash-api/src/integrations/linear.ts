import type { LinearClient, Organization, Team } from "@linear/sdk";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { SyncWorkspaceWorkflow } from "@local/hash-backend-utils/temporal-integration-workflow-types";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { OwnedById } from "@local/hash-graph-types/web";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

export const listTeams = async (params: {
  apiKey: string;
}): Promise<Team[]> => {
  const { apiKey } = params;

  const linearClient = new LinearClient({ apiKey });

  let teamsConnection = await linearClient.teams();
  const teams = teamsConnection.nodes;

  while (teamsConnection.pageInfo.hasNextPage) {
    teamsConnection = await teamsConnection.fetchNext();
    teams.push(...teamsConnection.nodes);
  }

  return teams;
};

export const getOrganization = async (params: {
  apiKey: string;
}): Promise<Organization> => {
  const { apiKey } = params;

  const linearClient = new LinearClient({ apiKey });

  const organization = await linearClient.organization;

  return organization;
};

export class Linear {
  private readonly temporalClient: TemporalClient;
  private readonly apiKey: string;

  constructor(params: { temporalClient: TemporalClient; apiKey: string }) {
    this.temporalClient = params.temporalClient;
    this.apiKey = params.apiKey;
  }

  public async triggerWorkspaceSync(params: {
    authentication: AuthenticationContext;
    workspaceOwnedById: OwnedById;
    teamIds: string[];
  }): Promise<void> {
    // TODO: Implement error handling
    await this.temporalClient.workflow.start<SyncWorkspaceWorkflow>(
      "syncWorkspace",
      {
        taskQueue: "integration",
        args: [
          {
            apiKey: this.apiKey,
            ...params,
          },
        ],
        workflowId: `syncWorkspace-${generateUuid()}`,
      },
    );
  }
}
