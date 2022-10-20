import { EntityType } from "@blockprotocol/type-system-web";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useBlockProtocolAggregateEntityTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolUpdateEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdateEntityType";
import { useAdvancedInitTypeSystem } from "../../../../lib/use-init-type-system";
import { getEntityTypesByBaseUri } from "../../../../lib/subgraph";

export const useEntityType = (
  entityTypeBaseUri: string,
  onCompleted?: (entityType: EntityType) => void,
) => {
  const [typeSystemLoading, loadTypeSystem] = useAdvancedInitTypeSystem();

  const [entityType, setEntityType] = useState<EntityType | null>(null);
  const entityTypeRef = useRef(entityType);

  const onCompletedRef = useRef(onCompleted);
  useLayoutEffect(() => {
    onCompletedRef.current = onCompleted;
  });

  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();
  const { updateEntityType } = useBlockProtocolUpdateEntityType();

  useEffect(() => {
    let cancelled = false;

    setEntityType(null);
    entityTypeRef.current = null;

    void aggregateEntityTypes({ data: {} }).then(async (res) => {
      const subgraph = res.data;
      const relevantEntityTypes = subgraph
        ? getEntityTypesByBaseUri(subgraph, entityTypeBaseUri)
        : [];

      /** @todo - pick the latest version? */
      const relevantEntityType = relevantEntityTypes
        ? relevantEntityTypes[0]!.inner
        : null;

      await loadTypeSystem();

      if (!cancelled) {
        setEntityType(relevantEntityType);
        entityTypeRef.current = relevantEntityType;
        if (relevantEntityType) {
          onCompletedRef.current?.(relevantEntityType);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [aggregateEntityTypes, entityTypeBaseUri, loadTypeSystem]);

  const updateCallback = useCallback(
    async (partialEntityType: Partial<Omit<EntityType, "$id">>) => {
      if (!entityTypeRef.current) {
        throw new Error("Cannot update yet");
      }

      const currentEntity = entityTypeRef.current;
      const { $id, ...restOfEntityType } = currentEntity;

      const res = await updateEntityType({
        data: {
          entityTypeId: $id,
          entityType: {
            ...restOfEntityType,
            ...partialEntityType,
          },
        },
      });

      if (entityTypeRef.current === currentEntity && res.data) {
        setEntityType(res.data.entityType);
        entityTypeRef.current = res.data.entityType;
      }

      return res;
    },
    [updateEntityType],
  );

  return [typeSystemLoading ? null : entityType, updateCallback] as const;
};
