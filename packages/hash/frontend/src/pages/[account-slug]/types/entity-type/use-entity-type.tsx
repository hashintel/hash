import { EntityType, extractBaseUri } from "@blockprotocol/type-system-web";
import { getEntityTypesByBaseUri } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { useRouter } from "next/router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useBlockProtocolAggregateEntityTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolCreateEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreateEntityType";
import { useBlockProtocolUpdateEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdateEntityType";
import { useAdvancedInitTypeSystem } from "../../../../lib/use-init-type-system";

export const useEntityTypeValue = (
  entityTypeBaseUri: string | null,
  accountId: string | null,
  onCompleted?: (entityType: EntityType) => void,
) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const { createEntityType } = useBlockProtocolCreateEntityType(accountId);
  const [, loadTypeSystem] = useAdvancedInitTypeSystem();

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

    if (
      entityTypeBaseUri &&
      (!entityType || extractBaseUri(entityType.$id) !== entityTypeBaseUri)
    ) {
      setLoading(true);
      setEntityType(null);
      entityTypeRef.current = null;
      void aggregateEntityTypes({ data: {} }).then(async (res) => {
        const subgraph = res.data;
        const relevantEntityTypes = subgraph
          ? getEntityTypesByBaseUri(subgraph, entityTypeBaseUri)
          : [];

        /** @todo - pick the latest version? */
        const relevantEntityType =
          relevantEntityTypes.length > 0
            ? relevantEntityTypes[0]!.schema
            : null;

        await loadTypeSystem();

        if (!cancelled) {
          setLoading(false);
          setEntityType(relevantEntityType);
          entityTypeRef.current = relevantEntityType;
          if (relevantEntityType) {
            onCompletedRef.current?.(relevantEntityType);
          }
        }
      });
      return () => {
        cancelled = true;
        setLoading(false);
      };
    }
  }, [aggregateEntityTypes, entityType, entityTypeBaseUri, loadTypeSystem]);

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
        setEntityType(res.data.schema);
        setLoading(false);
        entityTypeRef.current = res.data.schema;
      }

      return res;
    },
    [setEntityType, updateEntityType],
  );

  const publishDraft = useCallback(
    async (draftEntityType: EntityType) => {
      const res = await createEntityType({
        data: {
          entityType: draftEntityType,
        },
      });

      if (res.errors?.length || !res.data) {
        throw new Error("Could not publish changes");
      }

      const newUrl = extractBaseUri(res.data.schema.$id);

      if (newUrl) {
        setEntityType(res.data.schema);
        setLoading(false);
        entityTypeRef.current = res.data.schema;
        await router.replace(newUrl, newUrl, { shallow: true });
      }
    },
    [createEntityType, router, setEntityType],
  );

  return [
    loading ? null : entityType,
    updateCallback,
    publishDraft,
    { loading },
  ] as const;
};

export const EntityTypeContext = createContext<null | EntityType>(null);

export const useEntityType = () => {
  const entityTypeContext = useContext(EntityTypeContext);

  if (!entityTypeContext) {
    throw new Error("no EntityTypeEntitiesContext value has been provided");
  }

  return entityTypeContext;
};
