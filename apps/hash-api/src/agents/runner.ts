import { AgentType } from "@apps/hash-agents";
import { DataSource } from "apollo-datasource";
import fetch from "node-fetch";

import { withEnabledAgentRunner } from "./config";

export { agents } from "@apps/hash-agents";

export type AgentRunner = ReturnType<typeof setupAgentRunner> & DataSource;

export const setupAgentRunner = () => {
  return {
    runAgent: async <T extends AgentType["Agent"]>(
      agent: T,
      input: Extract<AgentType, { Agent: T }>["Input"],
    ): Promise<Extract<AgentType, { Agent: T }>["Output"]> => {
      const { url } = withEnabledAgentRunner();
      const endpoint = `${url}agents/${agent}`;
      return (
        await fetch(endpoint, {
          method: "POST",
          body: JSON.stringify(input),
          headers: {
            "Content-Type": "application/json",
          },
        })
      ).json();
    },
  };
};
