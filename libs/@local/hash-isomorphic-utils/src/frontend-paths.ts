import type { EntityId } from "@local/hash-subgraph";
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
