import { AgentType } from "@apps/hash-agents";
import { DataSource } from "apollo-datasource";
import fetch from "node-fetch";

import { withEnabledAgentRunner } from "./config";

export { agents } from "@apps/hash-agents";

export type AgentRunner = ReturnType<typeof setupAgentRunner> & DataSource;

export const setupAgentRunner = ({ url } = withEnabledAgentRunner()) => {
  return {
    executeAgent: async <T extends AgentType>(
      agent: T["Agent"],
      input: T["Input"],
    ): Promise<T["Output"]> => {
      const endpoint = `${url}/agents/${agent}`;
      return (
        await fetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ agent, input }),
        })
      ).json();
    },
  };
};
