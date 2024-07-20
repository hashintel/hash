import { useRouter } from "next/router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation } from "@apollo/client";
import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import type { AccountId } from "@local/hash-graph-types/account";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { ConstructEntityTypeParams } from "@local/hash-isomorphic-utils/types";
import {
  getEntityTypesByBaseUrl,
  getPropertyTypesForEntityType,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import type {
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
        } 
           
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
   *   a. We're on a draft, new entity type (in which case there's nothing from context)
   *   b. We have a context entity type.
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

      if (Boolean(res.errors?.length) || !res.data) {
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
