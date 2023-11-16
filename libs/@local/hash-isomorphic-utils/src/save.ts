import { ApolloClient } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import { updateBlockCollectionContents } from "@local/hash-isomorphic-utils/graphql/queries/block-collection.queries";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import {
  Entity,
  EntityId,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/src/shared/type-system-patch";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { generateNKeysBetween } from "fractional-indexing";
import { isEqual } from "lodash";
import { Node } from "prosemirror-model";
import { v4 as uuid } from "uuid";

import {
  getBlockCollectionResolveDepth,
  sortBlockCollectionLinks,
} from "./block-collection";
import { ComponentIdHashBlockMap } from "./blocks";
import { BlockEntity } from "./entity";
import {
  DraftEntity,
  EntityStore,
  getDraftEntityByEntityId,
  isDraftBlockEntity,
} from "./entity-store";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "./graph-queries";
import {
  Block as GqlBlock,
  GetEntityQuery,
  GetEntityQueryVariables,
  UpdateBlockCollectionAction,
  UpdateBlockCollectionContentsMutation,
  UpdateBlockCollectionContentsMutationVariables,
  UpdateBlockCollectionContentsResultPlaceholder,
} from "./graphql/api-types.gen";
import { systemEntityTypes, systemLinkEntityTypes } from "./ontology-type-ids";
import { isEntityNode } from "./prosemirror";
import {
  BlockProperties,
  HasIndexedContentProperties,
} from "./system-types/shared";

const generatePlaceholderId = () => `placeholder-${uuid()}`;

const flipMap = <K, V>(map: Map<K, V>): Map<V, K> =>
  new Map(Array.from(map, ([key, value]) => [value, key] as const));

type BeforeBlockDraftIdAndLink = [
  string,
  {
    linkEntityId: EntityId;
    fractionalIndex: string;
  },
];

type AfterBlockDraftIdAndLink = [
  string,
  {
    linkEntityId?: EntityId;
    fractionalIndex?: string;
  },
];

/**
 * Given the entity 'store', the 'blocks' persisted to the database, and the PromiseMirror 'doc',
 * determines what changes are needed to persist changes to the database.
 */
const calculateSaveActions = (
  store: EntityStore,
  ownedById: OwnedById,
  blocksAndLinks: {
    blockEntity: BlockEntity;
    contentLinkEntity: LinkEntity<HasIndexedContentProperties>;
  }[],
  doc: Node,
  getEntityTypeForComponent: (componentId: string) => VersionedUrl,
) => {
  const actions: UpdateBlockCollectionAction[] = [];

  const draftIdToPlaceholderId = new Map<string, string>();
  const draftIdToBlockEntities = new Map<string, DraftEntity<BlockEntity>>();

  for (const draftEntity of Object.values(store.draft)) {
    if (isDraftBlockEntity(draftEntity)) {
      // Draft blocks are checked for updates separately, after this loop
      draftIdToBlockEntities.set(draftEntity.draftId, draftEntity);
      continue;
    }

    if (draftEntity.metadata.recordId.entityId) {
      // This means the entity already exists, but may need updating
      const savedEntity = store.saved[draftEntity.metadata.recordId.entityId];

      /**
       * This can happen if the saved entity this draft entity belonged to has
       * been removed from the block collection post-save. We don't currently flush those
       * draft entities from the draft entity store when this happens.
       *
       * @todo Remove draft entities when they are removed from the block collection
       */
      if (!savedEntity) {
        continue;
      }

      // Nothing has changed…
      if (isEqual(savedEntity.properties, draftEntity.properties)) {
        continue;
      }

      actions.push({
        updateEntity: {
          entityId: draftEntity.metadata.recordId.entityId,
          properties: draftEntity.properties,
        },
      });
    } else {
      // We need to create the entity.

      /**
       * Sometimes, by the time it comes to create new entities, we have already
       * created an entity that depends on this one (i.e, text containing entities).
       * In this case, we need to use the placeholder ID used in that link instead
       * of generating new ones.
       *
       * When that happens, our insert action ends up needing to come before
       * the insert action of the entity that depends on this entity, so we
       * insert it at the front of the action list later on
       */
      const dependedOn = draftIdToPlaceholderId.has(draftEntity.draftId);
      const placeholderId = dependedOn
        ? draftIdToPlaceholderId.get(draftEntity.draftId)!
        : generatePlaceholderId();

      if (!dependedOn) {
        draftIdToPlaceholderId.set(draftEntity.draftId, placeholderId);
      }

      /**
       * At this point, we will supply the assumed entity type ID based on the component ID
       */
      const blockEntity = Object.values(store.draft).find(
        (entity): entity is DraftEntity<BlockEntity> =>
          isDraftBlockEntity(entity) &&
          entity.blockChildEntity?.draftId === draftEntity.draftId,
      );

      if (!blockEntity) {
        throw new Error("Cannot find parent entity");
      }

      const entityTypeId = getEntityTypeForComponent(
        blockEntity.componentId ?? "",
      );

      const action: UpdateBlockCollectionAction = {
        createEntity: {
          ownedById,
          entityPlaceholderId: placeholderId,
          entity: {
            entityTypeId,
            entityProperties: draftEntity.properties,
          },
        },
      };

      /**
       * When this entity is depended on, insert this action at the earliest
       * possible position on the list to ensure the later action can be
       * processed properly.
       *
       * @note If another entity *also* depends on this entity, this won't work,
       *       but we don't currently have multiple levels of linked entities
       *       being handled here, so that's okay for now.
       */
      if (dependedOn) {
        actions.unshift(action);
      } else {
        actions.push(action);
      }
    }
  }

  // Having dealt with non-block entities, now we check for changes in the blocks themselves
  // Block entities are wrappers which point to (a) a component and (b) a child entity
  // First, gather the ids of the blocks as they appear in the db-persisted block collection
  // along with the link's id and position, to be able to (a) remove links and (b) assign new positions relative any retained ones
  const beforeBlockDraftIds: BeforeBlockDraftIdAndLink[] = [];
  for (const { blockEntity, contentLinkEntity } of blocksAndLinks) {
    const draftEntity = getDraftEntityByEntityId(
      store.draft,
      blockEntity.metadata.recordId.entityId,
    );

    if (draftEntity) {
      beforeBlockDraftIds.push([
        draftEntity.draftId,
        {
          linkEntityId: contentLinkEntity.metadata.recordId.entityId,
          fractionalIndex:
            contentLinkEntity.properties[
              "https://hash.ai/@hash/types/property-type/fractional-index/"
            ],
        },
      ]);
    } else {
      /**
       * This entity is in the API's block list but not locally, which means it may have been added by another user recently.
       * Until we have a collaborative server the best we can do is ignore it in calculating save actions. H-1234
       */
    }
  }

  const afterBlockDraftIds: AfterBlockDraftIdAndLink[] = [];

  // Check nodes in the ProseMirror document to gather the ids of the blocks as they appear in the latest block collection
  doc.descendants((node) => {
    if (isEntityNode(node)) {
      if (!node.attrs.draftId) {
        throw new Error("Missing draft id");
      }

      const draftEntity = store.draft[node.attrs.draftId];

      if (!draftEntity) {
        throw new Error("Missing draft entity");
      }

      if (isDraftBlockEntity(draftEntity)) {
        afterBlockDraftIds.push([draftEntity.draftId, {}]);
        return false;
      }
    }

    return true;
  });

  /**
   * This is a crude and inefficient way of updating the fractional indices of the blocks.
   * We generate an entirely new series of indices, and then check if any of the block's previous indices
   * happen to be reusable instead of the new one assigned to them, and if so skip updating them.
   * When appending blocks this is fine, but shifting any existing blocks will involve a lot of new indices.
   * It basically defeats the point of having fractional indices in the first place,
   * and is a placeholder for a proper treatment of updating indices in the new list.
   *
   * @todo improve this to minimise the number of indices that need to be updated – H-1259
   */
  const newFractionalIndexSeries = generateNKeysBetween(
    null,
    null,
    afterBlockDraftIds.length,
  );

  /**
   * Check which of the latest blocks needs:
   * 1. Moving if it existed before but can't re-use its index
   * 2. Its child entity reference updating, if different from in the previous series
   * 3. Creating if it didn't exist in the previous series
   */
  for (let i = 0; i < afterBlockDraftIds.length; i++) {
    const afterDraftId = afterBlockDraftIds[i]![0];
    const newFractionalIndex = newFractionalIndexSeries[i]!;
    const newValue = afterBlockDraftIds[i]!;

    const oldValue = beforeBlockDraftIds.find(
      ([draftId]) => draftId === afterDraftId,
    );

    const previousFractionalIndex = oldValue?.[1]?.fractionalIndex;
    if (
      previousFractionalIndex &&
      (i < 0 || previousFractionalIndex > newFractionalIndexSeries[i - 1]!) &&
      (i >= newFractionalIndexSeries.length ||
        previousFractionalIndex < newFractionalIndexSeries[i + 1]!)
    ) {
      // No moving action required
    } else {
      newValue[1] = {
        linkEntityId: oldValue?.[1]?.linkEntityId,
        fractionalIndex: newFractionalIndex,
      };

      if (newValue[1].linkEntityId) {
        // We have an existing link entity and we couldn't re-use its fractional index – move it
        actions.push({
          moveBlock: {
            linkEntityId: newValue[1].linkEntityId,
            position: {
              indexPosition: {
                "https://hash.ai/@hash/types/property-type/fractional-index/":
                  newFractionalIndex,
              },
            },
          },
        });
      }
    }

    // Get the latest block entity and its child entity for the following step
    const draftEntity = draftIdToBlockEntities.get(afterDraftId);
    if (!draftEntity) {
      throw new Error("missing draft block entity");
    }
    const newChildEntityForBlock = draftEntity.blockChildEntity;

    /**
     * We also need to:
     * 1. For an existing block, check if its child entity needs changing
     * 2. For a block that wasn't in the previous series, create it
     */
    if (oldValue) {
      // We have an existing block – check if its child entity has changed and updated it if so
      if (!draftEntity.metadata.recordId.entityId) {
        throw new Error(
          `Draft entity with id ${draftEntity.draftId} has no saved entityId}`,
        );
      }

      const savedEntity = store.saved[draftEntity.metadata.recordId.entityId];
      if (!savedEntity) {
        throw new Error("missing saved block entity");
      }

      if (!("blockChildEntity" in savedEntity)) {
        throw new Error("Missing child entity in saved block entity");
      }

      const oldChildEntityForBlock = savedEntity.blockChildEntity;

      if (
        oldChildEntityForBlock.metadata.recordId.entityId !==
        newChildEntityForBlock?.metadata.recordId.entityId
      ) {
        if (!newChildEntityForBlock?.metadata.recordId.entityId) {
          // this should never happen because users select new child entities from API-provided entities.
          // if this errors in future, it's because users are choosing locally-created but not yet db-persisted entities
          throw new Error("New child entity for block has not yet been saved");
        }

        actions.push({
          swapBlockData: {
            entityId: savedEntity.metadata.recordId.entityId,
            newEntityEntityId:
              newChildEntityForBlock.metadata.recordId.entityId,
          },
        });
      }
    } else {
      // We have a new block – insert it
      const blockChildEntityId =
        newChildEntityForBlock?.metadata.recordId.entityId ??
        draftIdToPlaceholderId.get(newChildEntityForBlock!.draftId!);

      if (!blockChildEntityId) {
        throw new Error("Block data entity id missing");
      }

      const blockPlaceholderId = generatePlaceholderId();

      draftIdToPlaceholderId.set(draftEntity.draftId, blockPlaceholderId);

      actions.push({
        insertBlock: {
          ownedById,
          position: {
            indexPosition: {
              "https://hash.ai/@hash/types/property-type/fractional-index/":
                newFractionalIndex,
            },
          },
          entity: {
            // This cast is technically incorrect as the blockChildEntityId could be a placeholder.
            // In that case, we rely on the EntityId to be swapped out in the GQL resolver.
            existingEntityId: blockChildEntityId as EntityId,
          },
          blockPlaceholderId,
          componentId: draftEntity.componentId,
        },
      });
    }
  }

  /**
   * Check the old saved blocks to remove any which are missing from the new list
   */
  for (const [beforeBlockDraftId, { linkEntityId }] of beforeBlockDraftIds) {
    if (
      !afterBlockDraftIds.find(([draftId]) => draftId === beforeBlockDraftId)
    ) {
      actions.push({
        removeBlock: {
          linkEntityId,
        },
      });
    }
  }

  const placeholderToDraft = flipMap(draftIdToPlaceholderId);

  return [actions, placeholderToDraft] as const;
};

const getDraftEntityIds = (
  placeholders: UpdateBlockCollectionContentsResultPlaceholder[],
  placeholderToDraft: Map<string, string>,
) => {
  const result: Record<string, string> = {};

  for (const placeholder of placeholders) {
    const draftId = placeholderToDraft.get(placeholder.placeholderId);
    if (draftId) {
      result[draftId] = placeholder.entityId;
    }
  }

  return result;
};

const mapEntityToGqlBlock = (
  entity: Entity<BlockProperties>,
  entitySubgraph: Subgraph<EntityRootType>,
): GqlBlock => {
  if (entity.metadata.entityTypeId !== systemEntityTypes.block.entityTypeId) {
    throw new Error(
      `Entity with type ${entity.metadata.entityTypeId} is not a block`,
    );
  }

  const blockChildEntity = getOutgoingLinkAndTargetEntities(
    entitySubgraph,
    entity.metadata.recordId.entityId,
  ).find(
    ({ linkEntity: linkEntityRevisions }) =>
      linkEntityRevisions[0] &&
      linkEntityRevisions[0].metadata.entityTypeId ===
        systemLinkEntityTypes.hasData.linkEntityTypeId,
  )?.rightEntity[0];

  if (!blockChildEntity) {
    throw new Error(
      `Could not get data entity of block with entity ID ${entity.metadata.recordId.entityId}`,
    );
  }

  const componentId =
    entity.properties[
      "https://hash.ai/@hash/types/property-type/component-id/"
    ];

  return {
    blockChildEntity,
    componentId,
    metadata: entity.metadata,
    properties: entity.properties,
  };
};

export const save = async ({
  apolloClient,
  ownedById,
  blockCollectionEntityId,
  doc,
  store,
  getBlocksMap,
}: {
  apolloClient: ApolloClient<unknown>;
  ownedById: OwnedById;
  blockCollectionEntityId: EntityId;
  doc: Node;
  store: EntityStore;
  getBlocksMap: () => ComponentIdHashBlockMap;
}) => {
  const blockAndLinkList = await apolloClient
    .query<GetEntityQuery, GetEntityQueryVariables>({
      query: getEntityQuery,
      variables: {
        includePermissions: false,
        entityId: blockCollectionEntityId,
        ...zeroedGraphResolveDepths,
        ...getBlockCollectionResolveDepth({ blockDataDepth: 1 }),
        ...currentTimeInstantTemporalAxes,
      },
      fetchPolicy: "network-only",
    })
    .then(({ data }) => {
      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.getEntity.subgraph,
      );

      const [blockCollectionEntity] = getRoots(subgraph);

      const blocksAndLinks = getOutgoingLinkAndTargetEntities<
        {
          linkEntity: LinkEntity<HasIndexedContentProperties>[];
          rightEntity: Entity<BlockProperties>[];
        }[]
      >(subgraph, blockCollectionEntity!.metadata.recordId.entityId)
        .filter(
          ({
            linkEntity: linkEntityRevisions,
            rightEntity: rightEntityRevisions,
          }) =>
            linkEntityRevisions[0] &&
            linkEntityRevisions[0].metadata.entityTypeId ===
              systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId &&
            rightEntityRevisions[0] &&
            rightEntityRevisions[0].metadata.entityTypeId ===
              systemEntityTypes.block.entityTypeId,
        )
        .sort(({ linkEntity: a }, { linkEntity: b }) =>
          sortBlockCollectionLinks(a[0]!, b[0]!),
        )
        .map(
          ({
            rightEntity: rightEntityRevisions,
            linkEntity: linkEntityRevisions,
          }) => ({
            blockEntity: rightEntityRevisions[0]!,
            contentLinkEntity: linkEntityRevisions[0]!,
          }),
        );

      return blocksAndLinks.map(({ blockEntity, contentLinkEntity }) => ({
        blockEntity: mapEntityToGqlBlock(blockEntity, subgraph),
        contentLinkEntity,
      }));
    });

  const [actions, placeholderToDraft] = calculateSaveActions(
    store,
    ownedById,
    blockAndLinkList,
    doc,
    (componentId: string) => {
      const component = getBlocksMap()[componentId];

      if (!component) {
        throw new Error(`Component ${componentId} not found in blocksMap`);
      }

      return component.meta.schema as VersionedUrl;
    },
  );

  let currentBlocks = blockAndLinkList.map(({ blockEntity }) => blockEntity);

  let placeholders: UpdateBlockCollectionContentsResultPlaceholder[] = [];

  if (actions.length > 0) {
    const res = await apolloClient.mutate<
      UpdateBlockCollectionContentsMutation,
      UpdateBlockCollectionContentsMutationVariables
    >({
      variables: { entityId: blockCollectionEntityId, actions },
      mutation: updateBlockCollectionContents,
    });

    if (!res.data) {
      throw new Error("Failed");
    }

    currentBlocks =
      res.data.updateBlockCollectionContents.blockCollection.contents.map(
        (contentItem) => contentItem.rightEntity,
      );
    placeholders = res.data.updateBlockCollectionContents.placeholders;
  }
  const draftToEntityId = getDraftEntityIds(placeholders, placeholderToDraft);

  return [currentBlocks, draftToEntityId] as const;
};
