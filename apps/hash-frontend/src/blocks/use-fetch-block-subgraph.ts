import {
  GraphResolveDepths,
  Subgraph,
  SubgraphRootTypes,
} from "@blockprotocol/graph";
import { VersionedUri } from "@blockprotocol/type-system/slim";
import { EntityId } from "@local/hash-subgraph/main";
import { useCallback } from "react";

import { useBlockProtocolGetEntity } from "../components/hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";

export const useFetchBlockSubgraph = () => {
  const { getEntity } = useBlockProtocolGetEntity();

  const fetchBlockSubgraph = useCallback(
    async (blockEntityTypeId: VersionedUri, blockEntityId?: EntityId) => {
      const depths: GraphResolveDepths = {
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
        const now: string = new Date().toISOString();
        const placeholderEntity = {
          metadata: {
            recordId: {
              entityId: "placeholder-account%entity-id-not-set",
              version: now, // @todo-0.3 check this against types in @blockprotocol/graph when mismatches fixed
              versionId: now,
            },
            entityTypeId: blockEntityTypeId,
          },

          properties: {},
        };
        const blockEntitySubgraph = {
          depths,
          edges: {},
          roots: [
            {
              baseId: placeholderEntity.metadata.recordId.entityId,
              versionId: placeholderEntity.metadata.recordId.version,
            },
          ], // @todo-0.3 fix when type mismatches fixed
          vertices: {
            [placeholderEntity.metadata.recordId.entityId]: {
              [placeholderEntity.metadata.recordId.version]: {
                kind: "entity",
                inner: placeholderEntity,
              },
            },
          } as unknown as Subgraph["vertices"], // @todo-0.3 do something about this
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

          return {
            ...(data as unknown as Subgraph<SubgraphRootTypes["entity"]>), // @todo-0.3 do something about this,
            roots: [
              // @todo-0.3 remove this when edition ids match between HASH and BP
              {
                baseId: data.roots[0]!.baseId,
                versionId: data.roots[0]!.version,
              },
            ],
          } as Subgraph<SubgraphRootTypes["entity"]>;
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
