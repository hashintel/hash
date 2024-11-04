import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import { sortBlockCollectionLinks } from "@local/hash-isomorphic-utils/block-collection";
import type { BlockCollectionContentItem } from "@local/hash-isomorphic-utils/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { HasSpatiallyPositionedContent } from "@local/hash-isomorphic-utils/system-types/canvas";
import type {
  Block,
  HasIndexedContent,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import type {
  EntityRootType,
  GraphResolveDepths,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import type { GetEntitySubgraphQueryVariables } from "../../graphql/api-types.gen";

/**
 * The depths required to fetch the contents for blocks to render, rooted at a BlockCollection
 *
 * [BlockCollection] -[1]-> [Block] -[2]-> [Block Entity] -[3]-> [Linked Entity 1] -> [Linked Entity 2]
 *
 * This also resolves _incoming_ links to the BlockCollection to a depth of 4, to allow for incoming links
 * around the block entity's linked entities. This may result in fetching so much of the graph that we are
 * better off splitting the request into two:
 *
 * 1. BlockCollection { hasLeftEntity: { incoming: 1 }, hasRightEntity: { outgoing: 1 } }
 *    - fetches all Blocks in the collection (which have the Block Entities' ids as their rightEntity)
 * 2. Block Entity[] { hasLeftEntity: { incoming: 2, outgoing: 2 }, hasRightEntity: { incoming: 2, outgoing: 2 } }
 *    - fetches the entire graph of entities at a depth of 2 around all block entities in the collection
 *
 * Equivalent to providing each block with the graph resolved to a depth of 2 around the block entity.
 * Most blocks will require at least 1 (e.g. a table entity with an attached query), and many 2
 */
export const blockCollectionContentsDepths: GraphResolveDepths = {
  ...zeroedGraphResolveDepths,
  hasLeftEntity: { incoming: 4, outgoing: 4 },
  hasRightEntity: { incoming: 4, outgoing: 4 },
  isOfType: { outgoing: 1 },
};

export const blockCollectionContentsGetEntityVariables = {
  ...blockCollectionContentsDepths,
  includePermissions: true,
};

export const getBlockCollectionContentsStructuralQueryVariables = (
  pageEntityUuid: EntityUuid,
): GetEntitySubgraphQueryVariables => ({
  includePermissions: true,
  request: {
    filter: {
      all: [
        {
          equal: [
            { path: ["uuid"] },
            {
              parameter: pageEntityUuid,
            },
          ],
        },
      ],
    },
    graphResolveDepths: blockCollectionContentsDepths,
    includeDrafts: false,
    temporalAxes: currentTimeInstantTemporalAxes,
  },
});

export const isBlockCollectionContentsEmpty = (params: {
  contents: BlockCollectionContentItem[];
}) => {
  const { contents } = params;
  if (contents.length === 0) {
    return true;
  }

  if (
    contents.length === 1 &&
    contents[0]!.rightEntity.blockChildEntity.metadata.entityTypeIds.includes(
      systemEntityTypes.text.entityTypeId,
    )
  ) {
    const textualContent = contents[0]!.rightEntity.blockChildEntity.properties[
      blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl
    ] as TextToken[];

    return textualContent.length === 0;
  }

  return false;
};

export const getBlockCollectionContents = (params: {
  blockCollectionSubgraph: Subgraph<EntityRootType>;
  blockCollectionEntityId: EntityId;
}): BlockCollectionContentItem[] => {
  const { blockCollectionEntityId, blockCollectionSubgraph } = params;

  const blockCollection = getRoots(blockCollectionSubgraph)[0]!;
  const isCanvas = blockCollection.metadata.entityTypeIds.includes(
    systemEntityTypes.canvas.entityTypeId,
  );

  const outgoingContentLinks = getOutgoingLinkAndTargetEntities<
    {
      linkEntity:
        | LinkEntity<HasIndexedContent>[]
        | LinkEntity<HasSpatiallyPositionedContent>[];
      rightEntity: Entity<Block>[];
    }[]
  >(blockCollectionSubgraph, blockCollectionEntityId)
    .filter(
      ({ linkEntity: linkEntityRevisions }) =>
        linkEntityRevisions[0] &&
        linkEntityRevisions[0].metadata.entityTypeIds.includes(
          isCanvas
            ? systemLinkEntityTypes.hasSpatiallyPositionedContent
                .linkEntityTypeId
            : systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
        ),
    )
    .sort((a, b) =>
      sortBlockCollectionLinks(a.linkEntity[0]!, b.linkEntity[0]!),
    );

  return outgoingContentLinks.map<BlockCollectionContentItem>(
    ({
      linkEntity: containsLinkEntityRevisions,
      rightEntity: rightEntityRevisions,
    }) => {
      const rightEntity = rightEntityRevisions[0]!;

      const componentId =
        rightEntity.properties[
          "https://hash.ai/@hash/types/property-type/component-id/"
        ];

      const blockChildEntity = getOutgoingLinkAndTargetEntities(
        blockCollectionSubgraph,
        rightEntity.metadata.recordId.entityId,
      ).find(
        ({ linkEntity: linkEntityRevisions }) =>
          linkEntityRevisions[0] &&
          linkEntityRevisions[0].metadata.entityTypeIds.includes(
            systemLinkEntityTypes.hasData.linkEntityTypeId,
          ),
      )?.rightEntity[0];

      if (!blockChildEntity) {
        throw new Error("Error fetching block data");
      }

      return {
        linkEntity: containsLinkEntityRevisions[0]!,
        rightEntity: {
          metadata: rightEntity.metadata,
          properties: rightEntity.properties,
          blockChildEntity,
          componentId,
        },
      };
    },
  );
};
