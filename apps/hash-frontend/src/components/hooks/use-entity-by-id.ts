import { EntityId, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { useEffect, useState } from "react";

import { useBlockProtocolGetEntity } from "./block-protocol-functions/knowledge/use-block-protocol-get-entity";

export const useEntityById = (
  entityId: EntityId,
): {
  loading: boolean;
  entitySubgraph?: Subgraph<EntityRootType>;
} => {
  const [loading, setLoading] = useState(true);
  const [entitySubgraph, setEntitySubgraph] =
    useState<Subgraph<EntityRootType>>();

  const { getEntity } = useBlockProtocolGetEntity();

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await getEntity({ data: { entityId } });

        if (res.data) {
          setEntitySubgraph(res.data);
        }
      } finally {
        setLoading(false);
      }
    };

    void fetch();
  }, [getEntity, entityId]);

  return {
    loading,
    entitySubgraph,
  };
};
