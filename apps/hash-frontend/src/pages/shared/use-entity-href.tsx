import type { Entity, EntityId } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { useMemo } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";

export const generateEntityHref = (params: {
  entityId: EntityId;
  shortname: string;
}) =>
  `/@${params.shortname}/entities/${extractEntityUuidFromEntityId(
    params.entityId,
  )}`;

export const useEntityHref = (entity: Entity) => {
  const getOwnerForEntity = useGetOwnerForEntity();

  return useMemo(() => {
    const { shortname } = getOwnerForEntity(entity);

    return generateEntityHref({
      shortname,
      entityId: entity.metadata.recordId.entityId,
    });
  }, [getOwnerForEntity, entity]);
};
