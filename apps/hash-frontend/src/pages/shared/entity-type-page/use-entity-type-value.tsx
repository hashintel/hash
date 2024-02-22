import { useMutation } from "@apollo/client";
import {
  EntityType,
  PropertyTypeReference,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { ConstructEntityTypeParams } from "@local/hash-isomorphic-utils/types";
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

import {
  CreateEntityTypeMutation,
  CreateEntityTypeMutationVariables,
  UpdateEntityTypeMutation,
  UpdateEntityTypeMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  createEntityTypeMutation,
  updateEntityTypeMutation,
} from "../../../graphql/queries/ontology/entity-type.queries";
import {
  useEntityTypesLoading,
  useEntityTypesSubgraphOptional,
  useFetchEntityTypes,
} from "../../../shared/entity-types-context/hooks";

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

  const [createEntityType] = useMutation<
    CreateEntityTypeMutation,
    CreateEntityTypeMutationVariables
  >(createEntityTypeMutation);

  const entityTypesSubgraph = useEntityTypesSubgraphOptional();
  const entityTypesLoading = useEntityTypesLoading();
  const refetch = useFetchEntityTypes();

  const isDraft = !entityTypeBaseUrl;

  const [updateEntityType] = useMutation<
    UpdateEntityTypeMutation,
    UpdateEntityTypeMutationVariables
  >(updateEntityTypeMutation);

  const { contextEntityType, latestVersion } = useMemo<{
    contextEntityType: EntityTypeWithMetadata | null;
    latestVersion: number | null;
  }>(() => {
    if (entityTypesLoading || !entityTypesSubgraph || isDraft) {
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
          void router.replace(
            window.location.href.replace(
              `/v/${requestedVersion}`,
              `/v/${maxVersion}`,
            ),
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
    isDraft,
    requestedVersion,
    router,
  ]);

  const [stateEntityType, setStateEntityType] = useState(contextEntityType);

  /**
   * Update the state entity type from the one from the entity types context if
   * the two values are different, and one of the following is true:
   *   a. we're on a draft, new entity type (in which case there's nothing from context)
   *   b. we have a context entity type
   */
  if (stateEntityType !== contextEntityType && (isDraft || contextEntityType)) {
    setStateEntityType(contextEntityType);
  }

  const propertyTypes = useMemo<Record<
    VersionedUrl,
    PropertyTypeWithMetadata
  > | null>(() => {
    if (!stateEntityType || !entityTypesSubgraph) {
      return null;
    }

    const relevantPropertiesMap = getPropertyTypesForEntityType(
      stateEntityType.schema,
      entityTypesSubgraph,
    );

    return Object.fromEntries(relevantPropertiesMap);
  }, [stateEntityType, entityTypesSubgraph]);

  const stateEntityTypeRef = useRef(stateEntityType);
  useLayoutEffect(() => {
    stateEntityTypeRef.current = stateEntityType;
  });

  const completedRef = useRef<VersionedUrl | null>(null);

  // Ideally this side effect would be in a useLayoutEffect, but for some reason having it in an effect can cause
  // a crash when switching between entity types via the sidebar, where they have different properties.
  // Seems to be something to do with how react-hook-form resets array state, with it sometimes becoming malformed.
  // Moving it back into a useLayoutEffect also causes a bug with the property table loading, which was previously
  // fixed by a patch in https://github.com/hashintel/hash/pull/2012, but that patch _also_ seems to contribute to the bug.
  if (completedRef.current !== stateEntityType?.schema.$id) {
    // We need to change this to 'null' to detect a change if we move to a draft type (no stateEntityType) and then back to the original type
    completedRef.current = stateEntityType?.schema.$id ?? null;
    if (stateEntityType) {
      onCompleted?.(stateEntityType);
    }
  }

  const entityTypeUnavailable = entityTypesLoading && !stateEntityType;

  const lastFetchedBaseUrl = useRef(entityTypeBaseUrl);

  useEffect(() => {
    if (lastFetchedBaseUrl.current !== entityTypeBaseUrl && entityTypeBaseUrl) {
      lastFetchedBaseUrl.current = entityTypeBaseUrl;
      void refetch();
    }
  }, [entityTypeBaseUrl, refetch]);

  const updateCallback = useCallback(
    async (
      partialEntityType: Partial<ConstructEntityTypeParams>,
      metadata: Pick<
        EntityTypeWithMetadata["metadata"],
        "icon" | "labelProperty"
      >,
    ) => {
      if (!stateEntityTypeRef.current) {
        throw new Error("Cannot update yet");
      }

      const {
        schema: { $id, ...restOfEntityType },
      } = stateEntityTypeRef.current;

      const res = await updateEntityType({
        variables: {
          entityTypeId: $id,
          updatedEntityType: {
            ...restOfEntityType,
            ...partialEntityType,
          },
          ...metadata,
        },
      });

      await refetch();

      return res;
    },
    [refetch, updateEntityType],
  );

  const publishDraft = useCallback(
    async (
      draftEntityType: EntityType,
      metadata: Pick<
        EntityTypeWithMetadata["metadata"],
        "icon" | "labelProperty"
      >,
    ) => {
      const res = await createEntityType({
        variables: {
          ownedById: accountId as OwnedById,
          entityType: draftEntityType,
          ...metadata,
        },
      });

      if (!!res.errors?.length || !res.data) {
        throw new Error("Could not publish changes");
      }

      await refetch();

      const newUrl = extractBaseUrl(res.data.createEntityType.schema.$id);

      await router.replace(newUrl, newUrl, { shallow: true });
    },
    [createEntityType, accountId, refetch, router],
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
