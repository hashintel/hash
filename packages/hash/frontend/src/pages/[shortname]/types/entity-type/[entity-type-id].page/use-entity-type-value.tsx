import {
  EntityType,
  extractBaseUri,
  PropertyType,
} from "@blockprotocol/type-system";
import { AccountId, OwnedById } from "@hashintel/hash-shared/types";
import { Subgraph } from "@hashintel/hash-subgraph";
import { getEntityTypesByBaseUri } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
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

interface EntityTypeAndPropertyTypes {
  entityType: EntityType;
  propertyTypes: Record<string, PropertyType>;
}

const getPropertTypes = (
  properties: any,
  subgraph: Subgraph,
  propertyTypes?: Map<string, PropertyType>,
) => {
  let propertyTypesMap = propertyTypes ?? new Map<string, PropertyType>();
  for (const prop of properties) {
    const propertyUri = "items" in prop ? prop.items.$ref : prop.$ref;
    if (!propertyTypesMap.has(propertyUri)) {
      const propertyType = getPropertyTypeById(subgraph, propertyUri)?.schema;

      if (propertyType) {
        for (const childProp of propertyType.oneOf) {
          if ("type" in childProp && childProp.type === "object") {
            propertyTypesMap = getPropertTypes(
              Object.values(childProp.properties),
              subgraph,
              propertyTypesMap,
            );
          }
        }
      }

      if (propertyType) {
        propertyTypesMap.set(propertyUri, propertyType);
      }
    }
  }

  return propertyTypesMap;
};

export const useEntityTypeValue = (
  entityTypeBaseUri: string | null,
  accountId: AccountId | null,
  onCompleted?: (entityType: EntityTypeAndPropertyTypes) => void,
) => {
  const router = useRouter();

  const { createEntityType } = useBlockProtocolCreateEntityType(
    accountId as OwnedById | null,
  );

  const entityTypesSubgraph = useEntityTypesSubgraphOptional();
  const entityTypesLoading = useEntityTypesLoading() || !entityTypeBaseUri;
  const refetch = useFetchEntityTypes();

  const { updateEntityType } = useBlockProtocolUpdateEntityType();

  const availableEntityTypeAndPropertyTypes = useMemo(() => {
    if (entityTypesLoading || !entityTypeBaseUri || !entityTypesSubgraph) {
      return null;
    }

    const relevantEntityTypes = getEntityTypesByBaseUri(
      entityTypesSubgraph,
      entityTypeBaseUri,
    );

    /** @todo - pick the latest version? */
    // @todo handle adding any linked properties to known property types
    const relevantEntityType =
      relevantEntityTypes.length > 0 ? relevantEntityTypes[0]!.schema : null;

    if (!relevantEntityType) {
      return null;
    }

    const relevantPropertiesMap = getPropertTypes(
      Object.values(relevantEntityType.properties),
      entityTypesSubgraph,
    );

    return {
      entityType: relevantEntityType,
      propertyTypes: Object.fromEntries(relevantPropertiesMap),
    };
  }, [entityTypeBaseUri, entityTypesSubgraph, entityTypesLoading]);

  const [
    rememberedEntityTypeAndPropertyTypes,
    setRememberedEntityTypeAndPropertyTypes,
  ] = useState<EntityTypeAndPropertyTypes | null>(
    availableEntityTypeAndPropertyTypes,
  );

  if (
    rememberedEntityTypeAndPropertyTypes !==
      availableEntityTypeAndPropertyTypes &&
    (availableEntityTypeAndPropertyTypes ||
      (rememberedEntityTypeAndPropertyTypes &&
        extractBaseUri(rememberedEntityTypeAndPropertyTypes.entityType.$id) !==
          entityTypeBaseUri))
  ) {
    setRememberedEntityTypeAndPropertyTypes(
      availableEntityTypeAndPropertyTypes,
    );
  }

  const rememberedEntityTypeAndPropertyTypesRef = useRef(
    rememberedEntityTypeAndPropertyTypes,
  );
  useLayoutEffect(() => {
    rememberedEntityTypeAndPropertyTypesRef.current =
      rememberedEntityTypeAndPropertyTypes;
  });

  const completedRef = useRef<EntityTypeAndPropertyTypes | null>(null);

  useLayoutEffect(() => {
    if (
      completedRef.current !== rememberedEntityTypeAndPropertyTypes &&
      rememberedEntityTypeAndPropertyTypes
    ) {
      completedRef.current = rememberedEntityTypeAndPropertyTypes;
      onCompleted?.(rememberedEntityTypeAndPropertyTypes);
    }
  });

  const entityTypeUnavailable =
    entityTypesLoading && !rememberedEntityTypeAndPropertyTypes;

  const lastFetchedBaseUri = useRef(entityTypeBaseUri);

  useEffect(() => {
    if (lastFetchedBaseUri.current !== entityTypeBaseUri) {
      lastFetchedBaseUri.current = entityTypeBaseUri;
      void refetch();
    }
  }, [entityTypeBaseUri, refetch]);

  const updateCallback = useCallback(
    async (partialEntityType: Partial<Omit<EntityType, "$id">>) => {
      if (!rememberedEntityTypeAndPropertyTypesRef.current) {
        throw new Error("Cannot update yet");
      }

      const currentEntity = rememberedEntityTypeAndPropertyTypesRef.current;
      const { $id, ...restOfEntityType } = currentEntity.entityType;

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
    entityTypeUnavailable ? null : rememberedEntityTypeAndPropertyTypes,
    updateCallback,
    publishDraft,
    { loading: entityTypeUnavailable },
  ] as const;
};
