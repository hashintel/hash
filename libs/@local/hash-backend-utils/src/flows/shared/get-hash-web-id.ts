import { extractWebIdFromEntityId } from "@blockprotocol/type-system";

import { getHashInstance } from "../../hash-instance.js";

import type { ActorEntityUuid, WebId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

/**
 * The id of the `h` web, which HASH's own flow definitions are seeded into: the web the `HASH Instance` entity is in.
 */
export const getHashWebId = async (
  graphApiClient: GraphApi,
  authentication: { actorId: ActorEntityUuid },
): Promise<WebId> => {
  const { entity } = await getHashInstance(
    { graphApi: graphApiClient },
    authentication,
  );

  return extractWebIdFromEntityId(entity.metadata.recordId.entityId);
};
