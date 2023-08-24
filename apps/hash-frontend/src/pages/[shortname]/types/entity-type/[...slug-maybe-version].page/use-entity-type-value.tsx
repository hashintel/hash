import {
  EntityType,
  PropertyTypeReference,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { ConstructEntityTypeParams } from "@local/hash-graphql-shared/graphql/types";
import {
  AccountId,
  BaseUrl,
  EntityTypeWithMetadata,
  OwnedById,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getEntityTypesByBaseUrl,
  getPropertyTypeById,
} from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/type-system-patch";
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

/**
 * Adds all property types referenced by the given property reference objects to the provided map,
 * including from nested property objects each property type may further reference.
 *
 * The subgraph must be a result of having queried for an entity type with sufficiently high depth
 * for constrainsPropertiesOn to contain all property types referenced by the entity type and its properties.
 *
 * @param propertyReferenceObjects The values of an entity type or property type's 'properties' object
 * @param subgraph a subgraph which is assumed to contain all relevant property types
 * @param propertyTypesMap the map to add the property types to
 *
 * @return nothing, because the caller provided the map
 *
 * @throws if the subgraph does not contain a property type referenced by the given reference objects
 *
 * @todo this is a good candidate for moving to somewhere shared, possibly @blockprotocol/graph's stdlib
 */
const addPropertyTypesToMapFromReferences = (
  propertyReferenceObjects: ValueOrArray<PropertyTypeReference>[],
  subgraph: Subgraph,
  propertyTypesMap: Map<string, PropertyTypeWithMetadata>,
) => {
  for (const referenceObject of propertyReferenceObjects) {
    const propertyUrl =
      "items" in referenceObject
        ? referenceObject.items.$ref
        : referenceObject.$ref;
    if (!propertyTypesMap.has(propertyUrl)) {
      const propertyType = getPropertyTypeById(subgraph, propertyUrl);

      if (propertyType) {
        for (const childProp of propertyType.schema.oneOf) {
          if ("type" in childProp && childProp.type === "object") {
            addPropertyTypesToMapFromReferences(
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
};

/**
 * Gets a map of all property types referenced by the entity type to the provided map,
 * including from any parents in its inheritance chain and nested property objects,
 *
 * The subgraph must be a result of having queried for an entity type with sufficiently high depth
 * for constrainsPropertiesOn and inheritsFrom to contain all parent entity types and property types they reference.
 *
 * @param entityType The entity type to provide properties for
 * @param subgraph a subgraph which is assumed to contain all relevant property types
 *
 * @throws if the subgraph does not contain a property type or parent entity type relied on by the entity type
 *
 * @todo this is a good candidate for moving to somewhere shared, possibly @blockprotocol/graph's stdlib
 */
const getPropertyTypesForEntityType = (
  entityType: EntityType,
  subgraph: Subgraph,
  propertyTypesMap = new Map<string, PropertyTypeWithMetadata>(),
) => {
  addPropertyTypesToMapFromReferences(
    Object.values(entityType.properties),
    subgraph,
    propertyTypesMap,
  );

  for (const parentReference of entityType.allOf ?? []) {
    const parentEntityType = getEntityTypeById(subgraph, parentReference.$ref);

    if (!parentEntityType) {
      throw new Error(
        `Could not find parent entity type ${parentReference.$ref} for entity type ${entityType.$id}`,
      );
    }

    getPropertyTypesForEntityType(
      parentEntityType.schema,
      subgraph,
      propertyTypesMap,
    );
  }

  return propertyTypesMap;
};

// @todo rethink this from scratch, it's probably more complicated than it needs to be
export const useEntityTypeValue = (
  entityTypeBaseUrl: BaseUrl | null,
  requestedVersion: number | null,
  accountId: AccountId | null,
  onCompleted?: (entityType: EntityTypeWithMetadata) => void,
) => {
  const router = useRouter();

  const { createEntityType } = useBlockProtocolCreateEntityType(
    accountId as OwnedById | null,
  );

  const entityTypesSubgraph = useEntityTypesSubgraphOptional();
  const entityTypesLoading = useEntityTypesLoading() || !entityTypeBaseUrl;
  const refetch = useFetchEntityTypes();

  const { updateEntityType } = useBlockProtocolUpdateEntityType();

  const { contextEntityType, latestVersion } = useMemo<{
    contextEntityType: EntityTypeWithMetadata | null;
    latestVersion: number | null;
  }>(() => {
    if (entityTypesLoading || !entityTypesSubgraph) {
      return { contextEntityType: null, latestVersion: null };
    }

    const relevantEntityTypes = getEntityTypesByBaseUrl(
      entityTypesSubgraph,
      entityTypeBaseUrl,
    );

    if (relevantEntityTypes.length > 0) {
      const availableVersions = relevantEntityTypes.map(
        ({
          metadata: {
            recordId: { version },
          },
        }) => version,
      );

      const maxVersion = Math.max(...availableVersions);

      // Return the requested version if one has been specified and it exists
      if (requestedVersion) {
        const indexOfRequestedVersion =
          availableVersions.indexOf(requestedVersion);

        if (indexOfRequestedVersion >= 0) {
          return {
            contextEntityType: relevantEntityTypes[indexOfRequestedVersion]!,
            latestVersion: maxVersion,
          };
        } else {
          // eslint-disable-next-line no-console -- intentional debugging logging
          console.warn(
            `Requested version ${requestedVersion} not found – redirecting to latest.`,
          );
        }
      }

      // Otherwise, return the latest version
      const relevantVersionIndex = availableVersions.indexOf(maxVersion);
      return {
        contextEntityType: relevantEntityTypes[relevantVersionIndex]!,
        latestVersion: maxVersion,
      };
    }

    return { contextEntityType: null, latestVersion: null };
  }, [
    entityTypeBaseUrl,
    entityTypesLoading,
    entityTypesSubgraph,
    requestedVersion,
  ]);

  const [stateEntityType, setStateEntityType] = useState(contextEntityType);

  if (
    stateEntityType !== contextEntityType &&
    (contextEntityType ||
      (stateEntityType &&
        (requestedVersion && entityTypeBaseUrl
          ? stateEntityType.schema.$id !==
            versionedUrlFromComponents(entityTypeBaseUrl, requestedVersion)
          : extractBaseUrl(stateEntityType.schema.$id) !== entityTypeBaseUrl)))
  ) {
    setStateEntityType(contextEntityType);
  }

  const propertyTypesRef = useRef<Record<
    VersionedUrl,
    PropertyTypeWithMetadata
  > | null>(null);

  const propertyTypes = useMemo(() => {
    if (!stateEntityType || !entityTypesSubgraph) {
      return null;
    }

    const relevantPropertiesMap = getPropertyTypesForEntityType(
      stateEntityType.schema,
      entityTypesSubgraph,
    );

    return {
      // We add the previous property types to the new ones here to avoid the following bug (H-551):
      // 1. Be viewing an entity type which relies on a non-latest property type
      // 2. Switch to an entity type which doesn't refer to that property type, and:
      //    – propertyTypes is updated to _not_ contain that non-latest property type, since it's not relevant to the new entity type
      //    - the propertyTypeOptions given to the type editor of 'all latest property types' also doesn't contain it
      //    - state update for property type options reaches the type editor before the form data is reset in onCompleted,
      //        causing the type editor to crash because its form data refers to a property type it hasn't been provided with
      // Ideally we would not have the form data and property type options be out of sync, but it requires more thought/work
      ...Object.fromEntries(relevantPropertiesMap),
      ...(propertyTypesRef.current ? propertyTypesRef.current : {}),
    };
  }, [stateEntityType, entityTypesSubgraph]);

  useLayoutEffect(() => {
    propertyTypesRef.current = propertyTypes;
  });

  const stateEntityTypeRef = useRef(stateEntityType);
  useLayoutEffect(() => {
    stateEntityTypeRef.current = stateEntityType;
  });

  const completedRef = useRef<VersionedUrl | null>(null);

  // Ideally this side effect would be in a useLayoutEffect, but for some reason having it in an effect can cause
  // to the bug described above (see mention of H-551 above), even with the property type option merging.
  //
  // Moving it back into a useLayoutEffect also causes a bug with the property table loading, which was previously
  // fixed by a patch in https://github.com/hashintel/hash/pull/2012, but that patch _also_ seems to contribute to the bug.
  // @todo figure out what the issue in interaction between react-hook-form's form data, and the property options in React state
  if (stateEntityType && completedRef.current !== stateEntityType.schema.$id) {
    completedRef.current = stateEntityType.schema.$id;
    onCompleted?.(stateEntityType);
  }

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

      const {
        schema: { $id, ...restOfEntityType },
      } = stateEntityTypeRef.current;

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
    latestVersion,
    propertyTypes,
    updateCallback,
    publishDraft,
    { loading: entityTypeUnavailable },
  ] as const;
};
