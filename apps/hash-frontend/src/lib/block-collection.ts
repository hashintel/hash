import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import {
  blockProtocolTypes,
  systemTypes,
} from "@local/hash-isomorphic-utils/ontology-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { ContainsProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { EntityId, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getOutgoingLinkAndTargetEntities } from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";

import { BlockCollectionContentItem } from "../graphql/api-types.gen";

export const isBlockCollectionContentsEmpty = (params: {
  contents: BlockCollectionContentItem[];
}) => {
  const { contents } = params;
  if (contents.length === 0) {
    return true;
  }

  if (
    contents.length === 1 &&
    contents[0]!.rightEntity.blockChildEntity.metadata.entityTypeId ===
      systemTypes.entityType.text.entityTypeId
  ) {
    const textualContent = contents[0]!.rightEntity.blockChildEntity.properties[
      extractBaseUrl(
        blockProtocolTypes.propertyType.textualContent.propertyTypeId,
      )
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
  const outgoingContentLinks = getOutgoingLinkAndTargetEntities(
    blockCollectionSubgraph,
    blockCollectionEntityId,
  )
    .filter(
      ({ linkEntity: linkEntityRevisions }) =>
        linkEntityRevisions[0] &&
        linkEntityRevisions[0].metadata.entityTypeId ===
          systemTypes.linkEntityType.contains.linkEntityTypeId,
    )
    .sort((a, b) => {
      const aLinkEntity = a.linkEntity[0] as LinkEntity<ContainsProperties>;
      const bLinkEntity = b.linkEntity[0] as LinkEntity<ContainsProperties>;

      const { numericIndex: aNumericIndex } = simplifyProperties(
        aLinkEntity.properties,
      );
      const { numericIndex: bNumericIndex } = simplifyProperties(
        bLinkEntity.properties,
      );

      return (
        (aNumericIndex ?? 0) - (bNumericIndex ?? 0) ||
        aLinkEntity.metadata.recordId.entityId.localeCompare(
          bLinkEntity.metadata.recordId.entityId,
        ) ||
        aLinkEntity.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          bLinkEntity.metadata.temporalVersioning.decisionTime.start.limit,
        )
      );
    });

  return outgoingContentLinks.map<BlockCollectionContentItem>(
    ({
      linkEntity: containsLinkEntityRevisions,
      rightEntity: rightEntityRevisions,
    }) => {
      const rightEntity = rightEntityRevisions[0]!;

      const componentId = rightEntity.properties[
        extractBaseUrl(systemTypes.propertyType.componentId.propertyTypeId)
      ] as string;

      const blockChildEntity = getOutgoingLinkAndTargetEntities(
        blockCollectionSubgraph,
        rightEntity.metadata.recordId.entityId,
      ).find(
        ({ linkEntity: linkEntityRevisions }) =>
          linkEntityRevisions[0] &&
          linkEntityRevisions[0].metadata.entityTypeId ===
            systemTypes.linkEntityType.hasData.linkEntityTypeId,
      )?.rightEntity[0];

      if (!blockChildEntity) {
        throw new Error("Error fetching block data");
      }

      return {
        linkEntity: containsLinkEntityRevisions[0]!,
        rightEntity: {
          ...rightEntity,
          blockChildEntity,
          componentId,
        },
      };
    },
  );
};
