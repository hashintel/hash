import { useLazyQuery } from "@apollo/client";
import type {
  BaseUrl,
  EntityType,
  EntityTypeWithMetadata,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  componentsFromVersionedUrl,
  extractBaseUrl,
  isExternalOntologyElementMetadata,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { useCallback, useMemo } from "react";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../graphql/api-types.gen";
import { queryEntityTypesQuery } from "../../../graphql/queries/ontology/entity-type.queries";
import { useAuthenticatedUser } from "../auth-info-context";

export type EntityTypeDependent = {
  entityType: EntityType;
  /**
   * If the dependents of this type were not checked – why?
   *
   * - "user-excluded" – the hook was instructed to exclude this type: the user doesn't want to upgrade it
   * - "external-web" – the type is owned by an external web: the user cannot upgrade it
   * - "external-type-host" – the type is hosted on an external type host: the user cannot upgrade it
   */
  noFurtherTraversalBecause?:
    | "user-excluded"
    | "external-web"
    | "external-type-host";
  /**
   * The types that this type depends on that were encountered during traversal.
   * These will all be either among the dependents returned from the hook, or the initially-provided type.
   */
  dependentOn: Set<BaseUrl>;
};

/**
 * We'll look for types dependening on the provided entity type at ANY version,
 * in case some dependents are on older or newer versions.
 *
 * As the hook is used to allow users to make a graph of types have consistent references across them,
 * we do this so that we allow all types to end up on the next version of all types,
 * regardless of the discrepancies in versions that exist across the current graph.
 */
const generateDependentsFilter = (entityTypeBaseUrl: BaseUrl) => ({
  any: [
    {
      equal: [
        { path: ["links", "*", "baseUrl"] },
        { parameter: entityTypeBaseUrl },
      ],
    },
    {
      equal: [
        {
          path: ["inheritsFrom(inheritanceDepth=0)", "*", "baseUrl"],
        },
        {
          parameter: entityTypeBaseUrl,
        },
      ],
    },
    {
      equal: [
        {
          path: ["linkDestinations", "*", "baseUrl"],
        },
        {
          parameter: entityTypeBaseUrl,
        },
      ],
    },
  ],
});

/**
 * This hook is designed to find all the dependents of a given entity type to allow users to upgrade types in a way that is consistent across the graph.
 *
 * It has design decisions tailored to that purpose which should be taken into account if re-using it elsewhere:
 * 1. If the provided entityTypeId depends on itself, this is not reported. The caller is assumed to deal with this case.
 * 2. Types are classified as dependents if their LATEST version depends on ANY version of a type, i.e.
 *    - if ONLY an EARLIER version of a type depends on any type in the resulting graph, it is NOT reported (the latestOnly: true query will not capture it)
 *    - if the latest version of a type depends on a DIFFERENT version of one of those encountered, it IS reported.
 * This is to allow all the LATEST version of types to be upgraded to the LATEST version of whatever types they currently refer to,
 * regardless of what version they currently refer to, and to IGNORE older versions of types which no longer refer to types encountered.
 */
export const useGetEntityTypeDependents = (): {
  getEntityTypeDependents: (params: {
    entityTypeId: VersionedUrl;
    excludeBaseUrls?: BaseUrl[];
  }) => Promise<Record<BaseUrl, EntityTypeDependent>>;
  loading: boolean;
} => {
  const [queryEntityTypes, { loading }] = useLazyQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-first",
  });

  const { authenticatedUser } = useAuthenticatedUser();

  const userWebs = useMemo<WebId[]>(() => {
    return [
      authenticatedUser.accountId as WebId,
      ...authenticatedUser.memberOf.map(({ org }) => org.webId),
    ];
  }, [authenticatedUser]);

  const getEntityTypeDependents = useCallback(
    async ({
      entityTypeId: rootEntityTypeId,
      excludeBaseUrls,
    }: {
      entityTypeId: VersionedUrl;
      excludeBaseUrls?: BaseUrl[];
    }) => {
      const dependentsByBaseUrl: Record<BaseUrl, EntityTypeDependent> = {};

      const layerStack = [[rootEntityTypeId]];

      while (layerStack.length > 0) {
        const nextEntityTypeIds = layerStack.pop()!;

        const dependentsAndBaseUrl = await Promise.all(
          nextEntityTypeIds.map(async (nextTypeId) => {
            const { baseUrl } = componentsFromVersionedUrl(nextTypeId);

            const dependentTypesAtLatestVersion = await queryEntityTypes({
              variables: {
                request: {
                  filter: generateDependentsFilter(baseUrl),
                  temporalAxes: currentTimeInstantTemporalAxes,
                },
              },
            }).then((resp) => {
              if (!resp.data) {
                throw new Error("No data returned from queryEntityTypes");
              }

              return resp.data.queryEntityTypes.entityTypes;
            });

            return {
              baseUrl,
              dependentTypesAtLatestVersion,
            };
          }),
        );

        const currentDependentsByDependencyBaseUrl =
          dependentsAndBaseUrl.reduce<
            Record<BaseUrl, EntityTypeWithMetadata[]>
          >(
            (acc, { baseUrl, dependentTypesAtLatestVersion }) => {
              acc[baseUrl] = dependentTypesAtLatestVersion;
              return acc;
            },
            {} as Record<BaseUrl, EntityTypeWithMetadata[]>,
          );

        const nextLayer: VersionedUrl[] = [];

        for (const [dependencyBaseUrl, dependentTypes] of typedEntries(
          currentDependentsByDependencyBaseUrl,
        )) {
          for (const dependent of dependentTypes) {
            /**
             * This is the type passed to the hook – we already found its dependents,
             * and we don't need to report it as a dependent of itself or of any other types.
             * We assume that the caller will be rewriting its schema along with the others returned.
             */
            if (
              dependent.metadata.recordId.baseUrl ===
              extractBaseUrl(rootEntityTypeId)
            ) {
              continue;
            }

            const dependentBaseUrl = dependent.metadata.recordId.baseUrl;

            if (dependentsByBaseUrl[dependentBaseUrl]) {
              dependentsByBaseUrl[dependentBaseUrl].dependentOn.add(
                dependencyBaseUrl,
              );
              continue;
            }

            if (isExternalOntologyElementMetadata(dependent.metadata)) {
              dependentsByBaseUrl[dependentBaseUrl] = {
                entityType: dependent.schema,
                noFurtherTraversalBecause: "external-type-host",
                dependentOn: new Set([dependencyBaseUrl]),
              };
              continue;
            }

            if (!userWebs.includes(dependent.metadata.webId)) {
              dependentsByBaseUrl[dependentBaseUrl] = {
                entityType: dependent.schema,
                noFurtherTraversalBecause: "external-web",
                dependentOn: new Set([dependencyBaseUrl]),
              };
              continue;
            }

            const excludedByUser =
              !!excludeBaseUrls?.includes(dependentBaseUrl);

            if (!excludedByUser) {
              nextLayer.push(dependent.schema.$id);
            }

            dependentsByBaseUrl[dependentBaseUrl] = {
              entityType: dependent.schema,
              noFurtherTraversalBecause: excludedByUser
                ? "user-excluded"
                : undefined,
              dependentOn: new Set([dependencyBaseUrl]),
            };
          }

          if (nextLayer.length > 0) {
            layerStack.push(nextLayer);
          }
        }
      }

      return dependentsByBaseUrl;
    },
    [queryEntityTypes, userWebs],
  );

  return useMemo(
    () => ({
      getEntityTypeDependents,
      loading,
    }),
    [getEntityTypeDependents, loading],
  );
};
