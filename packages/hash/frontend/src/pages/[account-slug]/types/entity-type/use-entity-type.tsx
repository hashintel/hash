import {
  EntityType,
  extractBaseUri,
  VersionedUri,
} from "@blockprotocol/type-system-web";
import { useRouter } from "next/router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useBlockProtocolAggregateEntityTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolCreateEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreateEntityType";
import { useBlockProtocolUpdateEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdateEntityType";
import { useAuthenticatedUser } from "../../../../components/hooks/useAuthenticatedUser";
import { getEntityTypesByBaseUri } from "../../../../lib/subgraph";
import { useAdvancedInitTypeSystem } from "../../../../lib/use-init-type-system";
import { mustBeVersionedUri } from "./util";

export const useEntityType = (
  entityTypeBaseUri: string | null,
  namespace?: string,
  onCompleted?: (entityType: EntityType) => void,
) => {
  const router = useRouter();
  const { authenticatedUser } = useAuthenticatedUser();

  const { createEntityType } = useBlockProtocolCreateEntityType(
    namespace ?? authenticatedUser?.entityId ?? "",
  );
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

    if (
      entityTypeBaseUri &&
      (!entityType ||
        extractBaseUri(mustBeVersionedUri(entityType.$id)) !==
          entityTypeBaseUri)
    ) {
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
    }
  }, [
    aggregateEntityTypes,
    entityType,
    entityTypeBaseUri,
    loadTypeSystem,
    setEntityType,
  ]);

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

      // @todo remove casting
      const newUrl = extractBaseUri(res.data.entityTypeId as VersionedUri);

      if (newUrl) {
        setEntityType(res.data.entityType);
        entityTypeRef.current = res.data.entityType;
        await router.replace(newUrl, newUrl, { shallow: true });
      }
    },
    [createEntityType, router, setEntityType],
  );

  return [
    typeSystemLoading || !authenticatedUser ? null : entityType,
    updateCallback,
    publishDraft,
  ] as const;
};
