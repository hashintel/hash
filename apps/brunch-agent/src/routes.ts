/** Browser-facing route segments; conversation identity remains each agent's pinned `agentName`. */
export const GHERKIN_AGENT_ROUTE = "gherkin";
export const SDCPN_AGENT_ROUTE = "sdcpn";

/** One route per target agent; the gallery grows an entry per plugin (spec §13). */
export const AGENT_ROUTES = {
  gherkin: GHERKIN_AGENT_ROUTE,
  sdcpn: SDCPN_AGENT_ROUTE,
} as const;

export type AgentTarget = keyof typeof AGENT_ROUTES;

export const isAgentTarget = (value: string | null): value is AgentTarget =>
  value !== null && Object.hasOwn(AGENT_ROUTES, value);

/** Stock `DefaultChatTransport` endpoint used by Petrinaut's local panel. */
export const PETRINAUT_CHAT_ROUTE = "/api/chat";
