import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";

import type { EntityId } from "@blockprotocol/type-system";

/** The query parameter naming an unsaved draft's web. */
export const draftWebQueryParam = "draftWeb";

/**
 * A draft's URL: the path its net will have once saved, plus the web it
 * will be created in, which marks it as not saved yet. Saving drops the
 * query and changes nothing else, so the page stays mounted.
 */
export const draftPath = (
  entityId: EntityId,
  seedKey: string | null,
): string => {
  const query = new URLSearchParams({
    [draftWebQueryParam]: extractWebIdFromEntityId(entityId),
  });
  if (seedKey !== null) {
    query.set("example", seedKey);
  }
  return `/processes/${extractEntityUuidFromEntityId(entityId)}?${query.toString()}`;
};
