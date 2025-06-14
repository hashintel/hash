import type { MachineId, WebId } from "@blockprotocol/type-system";
import type { Organization, Team } from "@linear/sdk";
import { LinearClient } from "@linear/sdk";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { SyncWebWorkflow } from "@local/hash-backend-utils/temporal-integration-workflow-types";
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

  public async triggerWebSync(params: {
    authentication: { actorId: MachineId };
    webId: WebId;
    teamIds: string[];
  }): Promise<void> {
    // TODO: Implement error handling
    await this.temporalClient.workflow.start<SyncWebWorkflow>(
      "syncLinearToWeb",
      {
        taskQueue: "integration",
        args: [
          {
            apiKey: this.apiKey,
            ...params,
          },
        ],
        workflowId: `syncLinearToWeb-${generateUuid()}`,
      },
    );
  }
}
