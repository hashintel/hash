/**
 * The wire facts of reaching Brunch over HTTP: what Brunch serves and reads,
 * and what every hop in front of it must forward or expose. Imports nothing,
 * so any runtime can load it.
 */

/**
 * Request headers that carry conversation identity: who is acting, and which
 * of their conversations.
 */
export const brunchHeaders = {
  actor: "x-brunch-actor",
  conversation: "x-brunch-conversation",
  /**
   * The actor header's former name, which Brunch still reads when `actor` is
   * absent, so a browser client and Brunch can deploy in either order.
   * Temporary: remove once the Petrinaut website sends `actor` from its own
   * server-side hop and no client sends this name.
   */
  legacyPrincipal: "x-brunch-principal",
} as const;

/**
 * How a server-side caller proves to Brunch which caller it is:
 * `<header>: <scheme> <secret>`, with a secret per caller. Brunch accepts a
 * caller's secret only on that caller's own agent route. hash-api is the HASH
 * caller and uses the scheme it already authenticates to the graph with.
 * Browsers never send it: Brunch's CORS does not allow the header.
 */
export const brunchCallerAuthorization = {
  header: "authorization",
  hashScheme: "HASH-Service",
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
