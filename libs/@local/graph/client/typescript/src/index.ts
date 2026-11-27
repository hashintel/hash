import type { ActorEntityUuid, getGraph } from "./api.gen.js";

export * from "./api.gen.js";

export type GraphApi = ReturnType<typeof getGraph>;

/**
 * The headers that make the Graph run a request as `actorId`.
 */
export const actorHeaders = (actorId: ActorEntityUuid) => ({
  "X-Authenticated-User-Actor-Id": actorId,
});
