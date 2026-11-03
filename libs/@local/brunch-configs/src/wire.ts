/**
 * The wire facts of reaching Brunch over HTTP: what Brunch serves and reads,
 * and what every hop in front of it must forward or expose. Imports nothing,
 * so any runtime can load it.
 */

/**
 * Request headers that carry conversation identity. The owner key's header
 * name predates its rename from "principal" and is a wire name: changing it
 * needs a coordinated deploy of every client and server.
 */
export const brunchHeaders = {
  conversation: "x-brunch-conversation",
  ownerKey: "x-brunch-principal",
} as const;

/**
 * Response headers a cross-origin browser must be able to read, wherever it
 * reaches Brunch from: the durable-streams client reads its next offset,
 * cursor and up-to-date state from the `stream-*` headers, and a conversation's
 * admission names its instance in `location`.
 */
export const brunchExposedResponseHeaders = [
  "location",
  "stream-next-offset",
  "stream-cursor",
  "stream-up-to-date",
  "stream-closed",
  "stream-sse-data-encoding",
  "flue-error-ref",
] as const;

/** Server routes and route segments. */
export const brunchRoutes = {
  /** Where agents mount; each serves under `<agents>/<route>`. */
  agents: "/agents",
  /** The Petrinaut agent's route; conversation identity remains its pinned `agentName`. */
  petrinautAgent: "petrinaut",
  /** The HASH agent's route, which HASH's process page talks to. */
  hashAgent: "hash",
  /** Under an agent instance: where the bound browser claims and settles the calls issued to it. */
  browserCalls: "browser-calls",
  /** Cheap process-liveness probe; dependency readiness is established before listen. */
  health: "/health",
} as const;
