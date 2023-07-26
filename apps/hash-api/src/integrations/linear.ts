import { LinearClient, Team } from "@linear/sdk";

import { TemporalClient } from "../temporal";

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

export class Linear {
  private readonly temporalClient: TemporalClient;

  constructor(temporalClient: TemporalClient) {
    this.temporalClient = temporalClient;
  }
}
