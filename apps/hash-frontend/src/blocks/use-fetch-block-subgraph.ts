import { useLazyQuery } from "@apollo/client";
import type {
  EntityRootType,
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
import { currentTimestamp, splitEntityId } from "@blockprotocol/type-system";
import {
  deserializeQueryEntitySubgraphResponse,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { useCallback } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
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
  const [queryEntitySubgraph] = useLazyQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
  });

  const fetchBlockSubgraph = useCallback(
    async (
      blockEntityTypeIds: [VersionedUrl, ...VersionedUrl[]],
      blockEntityId?: EntityId,
      fallbackBlockProperties?: PropertyObject,
    ) => {
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

      const [webId, entityUuid, draftId] = splitEntityId(blockEntityId);
      return queryEntitySubgraph({
        variables: {
          request: {
            filter: {
              all: [
                {
                  equal: [{ path: ["webId"] }, { parameter: webId }],
                },
                {
                  equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
                },
                ...(draftId
                  ? [
                      {
                        equal: [{ path: ["draftId"] }, { parameter: draftId }],
                      },
                    ]
                  : []),
              ],
            },
            graphResolveDepths: {
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
            },
            temporalAxes: currentTimeInstantTemporalAxes,
            includeDrafts: !!draftId,
            includePermissions: true,
          },
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

          const response = deserializeQueryEntitySubgraphResponse(
            data.queryEntitySubgraph,
          );

          return {
            subgraph: response.subgraph,
            userPermissionsOnEntities: response.entityPermissions!,
          } satisfies SubgraphAndPermissions;
        })
        .catch((err) => {
          // eslint-disable-next-line no-console -- intentional debug log until we have better user-facing errors
          console.error(err);
          throw err;
        });
    },
    [queryEntitySubgraph],
  );

  return fetchBlockSubgraph;
};
