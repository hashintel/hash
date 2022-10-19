import {
  EntityType,
  extractBaseUri,
  VersionedUri,
} from "@blockprotocol/type-system-web";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useBlockProtocolAggregateEntityTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";
import { useBlockProtocolCreateEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolCreateEntityType";
import { useBlockProtocolUpdateEntityType } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolUpdateEntityType";
import { useUser } from "../../../../components/hooks/useUser";
import { useAdvancedInitTypeSystem } from "../../../../lib/use-init-type-system";
import { mustBeVersionedUri, useStateCallback } from "./util";
import { getEntityTypesByBaseUri } from "../../../../lib/subgraph";

export const useEntityType = (
  entityTypeBaseUri: string | null,
  onCompleted?: (entityType: EntityType) => void,
) => {
  const router = useRouter();
  const { user } = useUser();
  const { createEntityType } = useBlockProtocolCreateEntityType(
    // @todo should use routing URL?
    user?.accountId ?? "",
  );
  const [typeSystemLoading, loadTypeSystem] = useAdvancedInitTypeSystem();

  const [entityType, setEntityType] = useStateCallback<EntityType | null>(null);
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
      const { $id: _, ...remainingProperties } = draftEntityType;
      const res = await createEntityType({
        data: {
          entityType: remainingProperties,
        },
      });

      if (res.errors?.length || !res.data) {
        throw new Error("Could not publish changes");
      }

      // @todo remove casting
      const newUrl = extractBaseUri(res.data.entityTypeId as VersionedUri);

      // @todo we have the entity type here, lets set it…
      if (newUrl) {
        setEntityType(res.data.entityType, async () => {
          await router.replace(newUrl, newUrl, { shallow: true });
        });
        entityTypeRef.current = res.data.entityType;
      }
    },
    [createEntityType, router, setEntityType],
  );

  return [
    typeSystemLoading || !user ? null : entityType,
    updateCallback,
    publishDraft,
  ] as const;
};
