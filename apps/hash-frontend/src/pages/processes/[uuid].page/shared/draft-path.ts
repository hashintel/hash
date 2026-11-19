import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";

import type { EntityId } from "@blockprotocol/type-system";

/** The query parameter naming an unsaved draft's web. */
export const draftWebQueryParam = "draftWeb";

/**
 * A draft's route, as a Next.js destination: this page's fixed pathname,
 * with the draft's uuid, its web and its example as separate query values.
 * Next interpolates the uuid into the path, the net's path once saved, and
 * keeps the rest as the query, whose web marks it as not saved yet. Saving
 * drops the query and changes nothing else, so the page stays mounted.
 */
export const draftRoute = (entityId: EntityId, seedKey: string | null) => ({
  pathname: "/processes/[uuid]" as const,
  query: {
    uuid: extractEntityUuidFromEntityId(entityId),
    [draftWebQueryParam]: extractWebIdFromEntityId(entityId),
    ...(seedKey === null ? {} : { example: seedKey }),
  },
});
