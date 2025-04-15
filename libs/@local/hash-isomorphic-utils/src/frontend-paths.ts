import type { EntityId } from "@blockprotocol/type-system";
import { splitEntityId } from "@blockprotocol/type-system";

export const generateEntityPath = (params: {
  entityId: EntityId;
  includeDraftId: boolean;
  shortname: string;
}) => {
  const [_webId, entityUuid, draftId] = splitEntityId(params.entityId);
  const baseHref = `/@${params.shortname}/entities/${entityUuid}`;

  if (!draftId || !params.includeDraftId) {
    return baseHref;
  }

  return `${baseHref}?draftId=${draftId}`;
};
