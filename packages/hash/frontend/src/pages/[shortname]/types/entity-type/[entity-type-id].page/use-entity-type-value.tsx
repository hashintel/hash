import { EntityType, extractBaseUri } from "@blockprotocol/type-system";
import { getEntityTypesByBaseUri } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { AccountId, OwnedById } from "@local/hash-isomorphic-utils/types";
import { useRouter } from "next/router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useBlockProtocolCreateEntityType } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-entity-type";
import { useBlockProtocolUpdateEntityType } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-entity-type";
import {
  useEntityTypesLoading,
  useEntityTypesSubgraphOptional,
  useFetchEntityTypes,
} from "../../../../../shared/entity-types-context/hooks";

export const useEntityTypeValue = (
  entityTypeBaseUri: string | null,
  accountId: AccountId | null,
  onCompleted?: (entityType: EntityType) => void,
) => {
  const router = useRouter();

  const { createEntityType } = useBlockProtocolCreateEntityType(
    accountId as OwnedById | null,
  );

  const entityTypesSubgraph = useEntityTypesSubgraphOptional();
  const entityTypesLoading = useEntityTypesLoading() || !entityTypeBaseUri;
  const refetch = useFetchEntityTypes();

  const { updateEntityType } = useBlockProtocolUpdateEntityType();

  const availableEntityType = useMemo(() => {
    if (entityTypesLoading || !entityTypeBaseUri) {
      return null;
    }

    const relevantEntityTypes = entityTypesSubgraph
      ? getEntityTypesByBaseUri(entityTypesSubgraph, entityTypeBaseUri)
      : [];

    /** @todo - pick the latest version? */
    // @todo handle adding any linked properties to known property types
    return relevantEntityTypes.length > 0
      ? relevantEntityTypes[0]!.schema
      : null;
  }, [entityTypeBaseUri, entityTypesSubgraph, entityTypesLoading]);

  const [rememberedEntityType, setRememberedEntityType] =
    useState<EntityType | null>(availableEntityType);

  if (
    rememberedEntityType !== availableEntityType &&
    (availableEntityType ||
      (rememberedEntityType &&
        extractBaseUri(rememberedEntityType.$id) !== entityTypeBaseUri))
  ) {
    setRememberedEntityType(availableEntityType);
  }

  const rememberedEntityTypeRef = useRef(rememberedEntityType);
  useLayoutEffect(() => {
    rememberedEntityTypeRef.current = rememberedEntityType;
  });

  const completedRef = useRef<EntityType | null>(null);

  useLayoutEffect(() => {
    if (completedRef.current !== rememberedEntityType && rememberedEntityType) {
      completedRef.current = rememberedEntityType;
      onCompleted?.(rememberedEntityType);
    }
  });

  const entityTypeUnavailable = entityTypesLoading && !rememberedEntityType;

  const lastFetchedBaseUri = useRef(entityTypeBaseUri);

  useEffect(() => {
    if (lastFetchedBaseUri.current !== entityTypeBaseUri) {
      lastFetchedBaseUri.current = entityTypeBaseUri;
      void refetch();
    }
  }, [entityTypeBaseUri, refetch]);

  const updateCallback = useCallback(
    async (partialEntityType: Partial<Omit<EntityType, "$id">>) => {
      if (!rememberedEntityTypeRef.current) {
        throw new Error("Cannot update yet");
      }

      const currentEntity = rememberedEntityTypeRef.current;
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

      await refetch();

      return res;
    },
    [refetch, updateEntityType],
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

      await refetch();

      const newUrl = extractBaseUri(res.data.schema.$id);

      if (newUrl) {
        await router.replace(newUrl, newUrl, { shallow: true });
      }
    },
    [createEntityType, refetch, router],
  );

  return [
    entityTypeUnavailable ? null : rememberedEntityType,
    updateCallback,
    publishDraft,
    { loading: entityTypeUnavailable },
  ] as const;
};
