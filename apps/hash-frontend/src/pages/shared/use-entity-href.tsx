import type { Entity } from "@local/hash-graph-sdk/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { useMemo } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";

export const useEntityHref = (entity: Entity, includeDraftId: boolean) => {
  const getOwnerForEntity = useGetOwnerForEntity();

  return useMemo(() => {
    const { shortname } = getOwnerForEntity({
      entityId: entity.metadata.recordId.entityId,
    });

    return generateEntityPath({
      shortname,
      includeDraftId,
      entityId: entity.metadata.recordId.entityId,
    });
  }, [getOwnerForEntity, entity, includeDraftId]);
};
