import type { EntityId } from "@local/hash-graph-types/entity";
import { splitEntityId } from "@local/hash-subgraph";

export const generateEntityPath = (params: {
  entityId: EntityId;
  includeDraftId: boolean;
  shortname: string;
}) => {
  const [_ownedById, entityUuid, draftId] = splitEntityId(params.entityId);
  const baseHref = `/@${params.shortname}/entities/${entityUuid}`;

  if (!draftId || !params.includeDraftId) {
    return baseHref;
  }

  return `${baseHref}?draftId=${draftId}`;
};
