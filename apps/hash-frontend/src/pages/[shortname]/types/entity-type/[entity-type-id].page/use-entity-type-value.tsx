import {
  EntityType,
  extractBaseUri,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import { AccountId, OwnedById } from "@local/hash-graphql-shared/types";
import { Subgraph } from "@local/hash-subgraph";
import { getEntityTypesByBaseUri } from "@local/hash-subgraph/src/stdlib/element/entity-type";
import { getPropertyTypeById } from "@local/hash-subgraph/src/stdlib/element/property-type";
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

const getPropertyTypes = (
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
            propertyTypesMap = getPropertyTypes(
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

  const contextEntityType = useMemo(() => {
    if (entityTypesLoading || !entityTypeBaseUri || !entityTypesSubgraph) {
      return null;
    }

    const relevantEntityTypes = getEntityTypesByBaseUri(
      entityTypesSubgraph,
      entityTypeBaseUri,
    );

    if (relevantEntityTypes.length > 0) {
      const relevantVersions = relevantEntityTypes.map(
        ({
          metadata: {
            recordId: { version },
          },
        }) => version,
      );
      const relevantVersionindex = relevantVersions.indexOf(
        Math.max(...relevantVersions),
      );

      return relevantEntityTypes[relevantVersionindex]!.schema;
    }

    return null;
  }, [entityTypeBaseUri, entityTypesLoading, entityTypesSubgraph]);

  const [stateEntityType, setStateEntityType] = useState(contextEntityType);

  if (
    stateEntityType !== contextEntityType &&
    (contextEntityType ||
      (stateEntityType &&
        extractBaseUri(stateEntityType.$id) !== entityTypeBaseUri))
  ) {
    setStateEntityType(contextEntityType);
  }

  const propertyTypes = useMemo(() => {
    if (!stateEntityType || !entityTypesSubgraph) {
      return null;
    }

    const relevantPropertiesMap = getPropertyTypes(
      Object.values(stateEntityType.properties),
      entityTypesSubgraph,
    );

    return Object.fromEntries(relevantPropertiesMap);
  }, [stateEntityType, entityTypesSubgraph]);

  const stateEntityTypeRef = useRef(stateEntityType);
  useLayoutEffect(() => {
    stateEntityTypeRef.current = stateEntityType;
  });

  const completedRef = useRef<VersionedUri | null>(null);

  useLayoutEffect(() => {
    if (stateEntityType && completedRef.current !== stateEntityType.$id) {
      completedRef.current = stateEntityType.$id;
      onCompleted?.(stateEntityType);
    }
  });

  const entityTypeUnavailable = entityTypesLoading && !stateEntityType;

  const lastFetchedBaseUri = useRef(entityTypeBaseUri);

  useEffect(() => {
    if (lastFetchedBaseUri.current !== entityTypeBaseUri) {
      lastFetchedBaseUri.current = entityTypeBaseUri;
      void refetch();
    }
  }, [entityTypeBaseUri, refetch]);

  const updateCallback = useCallback(
    async (partialEntityType: Partial<Omit<EntityType, "$id">>) => {
      if (!stateEntityTypeRef.current) {
        throw new Error("Cannot update yet");
      }

      const { $id, ...restOfEntityType } = stateEntityTypeRef.current;

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
    entityTypeUnavailable ? null : stateEntityType,
    propertyTypes,
    updateCallback,
    publishDraft,
    { loading: entityTypeUnavailable },
  ] as const;
};
