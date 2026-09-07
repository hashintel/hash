/** Browser-facing route segments; conversation identity remains the agent's pinned `agentName`. */

export const CHAT_AGENT_ROUTE = "chat";

/** Cheap process-liveness probe; dependency readiness is established before listen. */
export const HEALTH_ROUTE = "/health";

/** Stock `DefaultChatTransport` endpoint used by Petrinaut's local panel. */
export const PETRINAUT_CHAT_ROUTE = "/api/chat";
