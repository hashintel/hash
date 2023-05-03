import { getRequiredEnv } from "../util";

const constructUrl = (host: string, port: number): string => {
  return new URL(`http://${host}:${port}`).toString();
};

export const AGENT_RUNNER =
  process.env.HASH_AGENT_RUNNER_ENABLED === "true"
    ? {
        url: constructUrl(
          getRequiredEnv("HASH_AGENT_RUNNER_HOST"),
          parseInt(getRequiredEnv("HASH_AGENT_RUNNER_PORT"), 10),
        ),
      }
    : "disabled";

export const withEnabledAgentRunner = () => {
  if (AGENT_RUNNER === "disabled") {
    throw new Error("Agent runner is disabled");
  }

  return AGENT_RUNNER;
};
