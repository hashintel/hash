import {
  EntityType,
  extractBaseUri,
  validateVersionedUri,
} from "@blockprotocol/type-system-web";
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
      const relevantEntity =
        res.data?.results.find((item) => {
          const validated = validateVersionedUri(item.entityTypeId);
          if (validated.type === "Err") {
            throw new Error("?");
          }
          const baseUri = extractBaseUri(validated.inner);
          return baseUri === entityTypeBaseUri;
        })?.entityType ?? null;

      await loadTypeSystem();

      if (!cancelled) {
        setEntityType(relevantEntity);
        entityTypeRef.current = relevantEntity;
        if (relevantEntity) {
          onCompletedRef.current?.(relevantEntity);
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
