import { LinearClient, Team } from "@linear/sdk";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";

import { TemporalClient } from "../temporal";

export const listTeams = async (): Promise<Team[]> => {
  const linearClient = new LinearClient({
    apiKey: getRequiredEnv("HASH_LINEAR_API_KEY"),
  });
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
