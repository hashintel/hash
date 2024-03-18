import type { Entity, EntityId } from "@local/hash-subgraph";
import { splitEntityId } from "@local/hash-subgraph";
import { useMemo } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";

export const generateEntityHref = (params: {
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

export const useEntityHref = (entity: Entity, includeDraftId: boolean) => {
  const getOwnerForEntity = useGetOwnerForEntity();

  return useMemo(() => {
    const { shortname } = getOwnerForEntity(entity);

    return generateEntityHref({
      shortname,
      includeDraftId,
      entityId: entity.metadata.recordId.entityId,
    });
  }, [getOwnerForEntity, entity, includeDraftId]);
};
