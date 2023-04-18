import { AgentTypes } from "@apps/hash-agents";
import fetch from "node-fetch";

import { withEnabledAgentRunner } from "./config";

export { agents } from "@apps/hash-agents";

export const executeAgent = async <T extends AgentTypes>(
  agent: T["Agent"],
  input: T["Input"],
  { url } = withEnabledAgentRunner(),
): Promise<T["Output"]> => {
  return (
    await fetch(url, {
      method: "POST",
      body: JSON.stringify({ agent, input }),
    })
  ).json();
};
