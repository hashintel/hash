import { useLazyQuery } from "@apollo/client";
import type {
  EntityRootType,
  GraphResolveDepths,
  KnowledgeGraphVertices,
  Subgraph,
} from "@blockprotocol/graph";
import type {
  ActorEntityUuid,
  EntityEditionId,
  EntityId,
  PropertyObject,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { currentTimestamp } from "@blockprotocol/type-system";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
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
  blockEntityTypeIds: [VersionedUrl, ...VersionedUrl[]],
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
      blockEntityTypeIds: [VersionedUrl, ...VersionedUrl[]],
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
        const now = currentTimestamp();
        const placeholderEntity = new HashEntity({
          metadata: {
            recordId: {
              entityId: "placeholder-account~entity-id-not-set" as EntityId,
              editionId: now as string as EntityEditionId,
            },
            entityTypeIds: blockEntityTypeIds,
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
            archived: false,
            provenance: {
              edition: {
                createdById: "placeholder-account" as ActorEntityUuid,
                actorType: "user",
                origin: {
                  type: "web-app",
                },
              },
              createdById: "placeholder-account" as ActorEntityUuid,
              createdAtTransactionTime: now,
              createdAtDecisionTime: now,
            },
          },
          properties: fallbackBlockProperties ?? {},
        });

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
          edges: {},
          roots: [
            {
              baseId: placeholderEntity.metadata.recordId.entityId,
              revisionId: now,
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

          const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<
            EntityRootType<HashEntity>
          >(data.getEntity.subgraph);

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
