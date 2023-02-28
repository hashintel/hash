import {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { ConstructEntityTypeParams } from "@local/hash-graphql-shared/graphql/types";
import { AccountId, BaseUrl, OwnedById, Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypesByBaseUrl,
  getPropertyTypeById,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
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
    const propertyUrl = "items" in prop ? prop.items.$ref : prop.$ref;
    if (!propertyTypesMap.has(propertyUrl)) {
      const propertyType = getPropertyTypeById(subgraph, propertyUrl)?.schema;

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
        propertyTypesMap.set(propertyUrl, propertyType);
      }
    }
  }

  return propertyTypesMap;
};

export const useEntityTypeValue = (
  entityTypeBaseUrl: BaseUrl | null,
  accountId: AccountId | null,
  onCompleted?: (entityType: EntityType) => void,
) => {
  const router = useRouter();

  const { createEntityType } = useBlockProtocolCreateEntityType(
    accountId as OwnedById | null,
  );

  const entityTypesSubgraph = useEntityTypesSubgraphOptional();
  const entityTypesLoading = useEntityTypesLoading() || !entityTypeBaseUrl;
  const refetch = useFetchEntityTypes();

  const { updateEntityType } = useBlockProtocolUpdateEntityType();

  const contextEntityType = useMemo(() => {
    if (entityTypesLoading || !entityTypesSubgraph) {
      return null;
    }

    const relevantEntityTypes = getEntityTypesByBaseUrl(
      entityTypesSubgraph,
      entityTypeBaseUrl,
    );

    if (relevantEntityTypes.length > 0) {
      const relevantVersions = relevantEntityTypes.map(
        ({
          metadata: {
            recordId: { version },
          },
        }) => version,
      );
      const relevantVersionIndex = relevantVersions.indexOf(
        Math.max(...relevantVersions),
      );

      return relevantEntityTypes[relevantVersionIndex]!.schema;
    }

    return null;
  }, [entityTypeBaseUrl, entityTypesLoading, entityTypesSubgraph]);

  const [stateEntityType, setStateEntityType] = useState(contextEntityType);

  if (
    stateEntityType !== contextEntityType &&
    (contextEntityType ||
      (stateEntityType &&
        extractBaseUrl(stateEntityType.$id) !== entityTypeBaseUrl))
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

  const completedRef = useRef<VersionedUrl | null>(null);

  useLayoutEffect(() => {
    if (stateEntityType && completedRef.current !== stateEntityType.$id) {
      completedRef.current = stateEntityType.$id;
      onCompleted?.(stateEntityType);
    }
  });

  const entityTypeUnavailable = entityTypesLoading && !stateEntityType;

  const lastFetchedBaseUrl = useRef(entityTypeBaseUrl);

  useEffect(() => {
    if (lastFetchedBaseUrl.current !== entityTypeBaseUrl) {
      lastFetchedBaseUrl.current = entityTypeBaseUrl;
      void refetch();
    }
  }, [entityTypeBaseUrl, refetch]);

  const updateCallback = useCallback(
    async (partialEntityType: Partial<ConstructEntityTypeParams>) => {
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

      const newUrl = extractBaseUrl(res.data.schema.$id);

      await router.replace(newUrl, newUrl, { shallow: true });
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
