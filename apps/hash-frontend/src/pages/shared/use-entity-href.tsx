import type { SimpleEntity } from "@local/hash-graph-types/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { useMemo } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";

export const useEntityHref = (
  entity: SimpleEntity,
  includeDraftId: boolean,
) => {
  const getOwnerForEntity = useGetOwnerForEntity();

  return useMemo(() => {
    const { shortname } = getOwnerForEntity({ entity });

    return generateEntityPath({
      shortname,
      includeDraftId,
      entityId: entity.metadata.recordId.entityId,
    });
  }, [getOwnerForEntity, entity, includeDraftId]);
};
