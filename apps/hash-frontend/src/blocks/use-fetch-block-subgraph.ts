import { useLazyQuery } from "@apollo/client";
import type { Entity as EntityBp } from "@blockprotocol/graph";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { EntityId, PropertyObject } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import type {
  EntityRevisionId,
  EntityRootType,
  GraphResolveDepths,
  KnowledgeGraphVertices,
  Subgraph,
} from "@local/hash-subgraph";
import { useCallback } from "react";

import type {
  GetEntityQuery,
  GetEntityQueryVariables,
  SubgraphAndPermissions as SubgraphAndPermissionsGQL,
} from "../graphql/api-types.gen";

type SubgraphAndPermissions = Omit<SubgraphAndPermissionsGQL, "subgraph"> & {
  subgraph: Subgraph<EntityRootType>;
};

export const useFetchBlockSubgraph = (): ((
  blockEntityTypeId: VersionedUrl,
  blockEntityId?: EntityId,
  fallbackBlockProperties?: PropertyObject,
) => Promise<
  Omit<SubgraphAndPermissions, "subgraph"> & {
    subgraph: Subgraph<EntityRootType>;
  }
>) => {
  const [getEntity] = useLazyQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntityQuery,
    {
      fetchPolicy: "cache-and-network",
    },
  );

  const fetchBlockSubgraph = useCallback(
    async (
      blockEntityTypeId: VersionedUrl,
      blockEntityId?: EntityId,
      fallbackBlockProperties?: PropertyObject,
    ) => {
      const depths: GraphResolveDepths = {
        constrainsValuesOn: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        constrainsLinksOn: { outgoing: 1 },
        constrainsLinkDestinationsOn: { outgoing: 1 },
        inheritsFrom: { outgoing: 255 },
        isOfType: { outgoing: 1 },
        hasRightEntity: {
          incoming: 2,
          outgoing: 2,
        },
        hasLeftEntity: {
          incoming: 2,
          outgoing: 2,
        },
      };

      if (!blockEntityId) {
        // when inserting a block in the frontend we don't yet have an entity associated with it
        // there's a delay while the request to the API to insert it is processed
        // @todo some better way of handling this – probably affected by revamped collab.
        //    or could simply not load a new block until the entity is created?
        const now = new Date().toISOString() as Timestamp;
        const placeholderEntity: EntityBp = {
          metadata: {
            recordId: {
              entityId: "placeholder-account~entity-id-not-set" as EntityId,
              editionId: now,
            },
            entityTypeId: blockEntityTypeId,
            temporalVersioning: {
              decisionTime: {
                start: {
                  kind: "inclusive",
                  limit: now,
                },
                end: {
                  kind: "unbounded",
                },
              },
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: now,
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
          },
          properties: fallbackBlockProperties ?? {},
        } as const;

        const subgraphTemporalAxes = {
          pinned: {
            axis: "transactionTime",
            timestamp: now,
          },
          variable: {
            axis: "decisionTime",
            interval: {
              start: {
                kind: "inclusive",
                limit: now,
              },
              end: {
                kind: "inclusive",
                limit: now,
              },
            },
          },
        } as const;
        const blockEntitySubgraph: Subgraph<EntityRootType> = {
          depths,
          edges: {},
          roots: [
            {
              baseId: placeholderEntity.metadata.recordId.entityId as EntityId,
              revisionId: now as EntityRevisionId,
            },
          ],
          vertices: {
            [placeholderEntity.metadata.recordId.entityId]: {
              [now]: {
                kind: "entity" as const,
                inner: placeholderEntity,
              },
            },
          } as KnowledgeGraphVertices,
          temporalAxes: {
            initial: subgraphTemporalAxes,
            resolved: subgraphTemporalAxes,
          },
        };

        return {
          subgraph: blockEntitySubgraph,
          userPermissionsOnEntities: {},
        } satisfies SubgraphAndPermissions;
      }

      return getEntity({
        variables: {
          entityId: blockEntityId,
          includePermissions: true,
          ...depths,
        },
      })
        .then(({ data, error }) => {
          if (!data) {
            throw new Error(
              `Could not get entity ${blockEntityId}: ${
                error ? error.message : "unknown error"
              }`,
            );
          }

          const subgraph =
            mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
              data.getEntity.subgraph,
            );

          return {
            subgraph,
            userPermissionsOnEntities:
              data.getEntity.userPermissionsOnEntities!,
          } satisfies SubgraphAndPermissions;
        })
        .catch((err) => {
          // eslint-disable-next-line no-console -- intentional debug log until we have better user-facing errors
          console.error(err);
          throw err;
        });
    },
    [getEntity],
  );

  return fetchBlockSubgraph;
};
