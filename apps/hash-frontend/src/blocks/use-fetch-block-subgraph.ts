import { VersionedUri } from "@blockprotocol/type-system/slim";
import {
  Entity,
  EntityId,
  EntityRevisionId,
  GraphResolveDepths,
  Subgraph,
  UpdatedById,
} from "@local/hash-types";
import { useCallback } from "react";

import { useBlockProtocolGetEntity } from "../components/hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";

export const useFetchBlockSubgraph = () => {
  const { getEntity } = useBlockProtocolGetEntity();

  const fetchBlockSubgraph = useCallback(
    async (blockEntityTypeId: VersionedUri, blockEntityId?: EntityId) => {
      const depths: GraphResolveDepths = {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn: { outgoing: 0 },
        constrainsPropertiesOn: { outgoing: 0 },
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 0 },
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
        const now = new Date().toISOString() as EntityRevisionId;
        const placeholderEntity: Entity = {
          metadata: {
            recordId: {
              entityId: "placeholder-account%entity-id-not-set" as EntityId,
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
            archived: false,
            provenance: {
              updatedById: "placeholder-account" as UpdatedById,
            },
          },
          properties: {},
        } as const;
        const blockEntitySubgraph: Subgraph = {
          depths,
          edges: {},
          roots: [
            {
              baseId: placeholderEntity.metadata.recordId.entityId,
              revisionId: now,
            },
          ], // @todo-0.3 fix when type mismatches fixed
          vertices: {
            [placeholderEntity.metadata.recordId.entityId]: {
              [now]: {
                kind: "entity",
                inner: placeholderEntity,
              },
            },
          },
        };

        return blockEntitySubgraph;
      }

      return getEntity({
        data: { entityId: blockEntityId },
      })
        .then(({ data, errors }) => {
          if (!data) {
            throw new Error(
              `Could not get entity ${blockEntityId} ${
                errors ? JSON.stringify(errors, null, 2) : ""
              }`,
            );
          }

          return data;
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
