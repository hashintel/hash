import { Team } from "@linear/sdk";

import { TemporalClient } from "../temporal";
import { genId } from "../util";

export class Linear {
  private readonly temporalClient: TemporalClient;

  constructor(temporalClient: TemporalClient) {
    this.temporalClient = temporalClient;
  }

  public async teams(): Promise<Team[]> {
    return this.temporalClient.workflow.execute("linearListTeams", {
      taskQueue: "integration",
      workflowId: `linearTeams-${genId()}`,
    });
  }
}
