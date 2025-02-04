import { useLazyQuery } from "@apollo/client";
import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  type EntityTypeRootType,
  isExternalOntologyElementMetadata,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useCallback, useMemo } from "react";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import { queryEntityTypesQuery } from "../../../graphql/queries/ontology/entity-type.queries";
import { useAuthenticatedUser } from "../auth-info-context";

type Dependent = {
  entityType: EntityType;
  noFurtherTraversalBecause?: "user-excluded" | "external-web";
};

const generateDependentsFilter = (entityTypeId: VersionedUrl) => ({
  any: [
    {
      equal: [
        { path: ["links", "*", "versionedUrl"] },
        { parameter: entityTypeId },
      ],
    },
    {
      equal: [
        {
          path: ["inheritsFrom(inheritanceDepth=0)", "*", "versionedUrl"],
        },
        {
          parameter: entityTypeId,
        },
      ],
    },
    {
      equal: [
        {
          path: ["linkDestinations", "*", "versionedUrl"],
        },
        {
          parameter: entityTypeId,
        },
      ],
    },
  ],
});

export const useGetEntityTypeDependents = (): ((params: {
  entityTypeId: VersionedUrl;
  excludeEntityTypeIds?: VersionedUrl[];
}) => Promise<Dependent[]>) => {
  const [queryEntityTypes] = useLazyQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery);

  const { authenticatedUser } = useAuthenticatedUser();

  const userWebs = useMemo<OwnedById[]>(() => {
    return [
      authenticatedUser.accountId as OwnedById,
      ...authenticatedUser.memberOf.map(
        ({ org }) => org.accountGroupId as OwnedById,
      ),
    ];
  }, [authenticatedUser]);

  return useCallback(
    async ({
      entityTypeId,
      excludeEntityTypeIds,
    }: {
      entityTypeId: VersionedUrl;
      excludeEntityTypeIds?: VersionedUrl[];
    }) => {
      const dependentsByVersionedUrl = new Map<VersionedUrl, Dependent>();

      const layerStack = [[entityTypeId]];

      while (layerStack.length > 0) {
        const nextEntityTypeIds = layerStack.pop()!;

        console.log("nextEntityTypeIds", nextEntityTypeIds);

        const dependents = (
          await Promise.all(
            nextEntityTypeIds.map((nextTypeId) =>
              queryEntityTypes({
                variables: {
                  filter: generateDependentsFilter(nextTypeId),
                  ...zeroedGraphResolveDepths,
                },
              }).then((resp) => {
                if (!resp.data) {
                  throw new Error("No data returned from queryEntityTypes");
                }

                const types = getRoots<EntityTypeRootType>(
                  mapGqlSubgraphFieldsFragmentToSubgraph(
                    resp.data.queryEntityTypes,
                  ),
                );

                return types;
              }),
            ),
          )
        ).flat();

        const nextLayer: VersionedUrl[] = [];
        for (const dependent of dependents) {
          if (dependent.schema.$id === entityTypeId) {
            continue;
          }

          if (isExternalOntologyElementMetadata(dependent.metadata)) {
            continue;
          }

          if (dependentsByVersionedUrl.has(dependent.schema.$id)) {
            continue;
          }

          if (!userWebs.includes(dependent.metadata.ownedById)) {
            dependentsByVersionedUrl.set(dependent.schema.$id, {
              entityType: dependent.schema,
              noFurtherTraversalBecause: "external-web",
            });
            continue;
          }

          const excludedByUser = !!excludeEntityTypeIds?.includes(
            dependent.schema.$id,
          );

          if (!excludedByUser) {
            nextLayer.push(dependent.schema.$id);
          }

          dependentsByVersionedUrl.set(dependent.schema.$id, {
            entityType: dependent.schema,
            noFurtherTraversalBecause: excludedByUser
              ? "user-excluded"
              : undefined,
          });
        }

        if (nextLayer.length > 0) {
          layerStack.push(nextLayer);
        }
      }

      return Array.from(dependentsByVersionedUrl.values());
    },
    [queryEntityTypes, userWebs],
  );
};
