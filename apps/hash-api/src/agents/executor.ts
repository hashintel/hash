import { AgentType } from "@apps/hash-agents";
import fetch from "node-fetch";

import { withEnabledAgentRunner } from "./config";

export { agents } from "@apps/hash-agents";

export const executeAgent = async <T extends AgentType>(
  agent: T["Agent"],
  input: T["Input"],
  { url } = withEnabledAgentRunner(),
): Promise<T["Output"]> => {
  const endpoint = `${url}/agents/${agent}`;
  return (
    await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ agent, input }),
    })
  ).json();
};
