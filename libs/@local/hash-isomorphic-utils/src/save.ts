import { ApolloClient } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import {
  getPageQuery,
  updatePageContents,
} from "@local/hash-graphql-shared/queries/page.queries";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { isEqual } from "lodash";
import { Node } from "prosemirror-model";
import { v4 as uuid } from "uuid";

import { ComponentIdHashBlockMap } from "./blocks";
import { BlockEntity, isDraftTextEntity } from "./entity";
import {
  DraftEntity,
  EntityStore,
  getDraftEntityByEntityId,
  isDraftBlockEntity,
  TEXT_ENTITY_TYPE_ID,
} from "./entity-store";
import {
  GetPageQuery,
  GetPageQueryVariables,
  UpdatePageAction,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
  UpdatePageContentsResultPlaceholder,
} from "./graphql/api-types.gen";
import { isEntityNode } from "./prosemirror";

const generatePlaceholderId = () => `placeholder-${uuid()}`;

const flipMap = <K, V>(map: Map<K, V>): Map<V, K> =>
  new Map(Array.from(map, ([key, value]) => [value, key] as const));

/**
 * Given the entity 'store', the 'blocks' persisted to the database, and the PromiseMirror 'doc',
 * determines what changes are needed to persist changes to the database.
 */
const calculateSaveActions = (
  store: EntityStore,
  ownedById: OwnedById,
  textEntityTypeId: VersionedUrl,
  blocks: BlockEntity[],
  doc: Node,
  getEntityTypeForComponent: (componentId: string) => VersionedUrl,
) => {
  const actions: UpdatePageAction[] = [];

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
       * been removed from the page post-save. We don't currently flush those
       * draft entities from the draft entity store when this happens.
       *
       * @todo Remove draft entities when they are removed from the page
       */
      if (!savedEntity) {
        continue;
      }

      // Nothing has changed…
      if (isEqual(savedEntity.properties, draftEntity.properties)) {
        continue;
      }

      const previousProperties = savedEntity.properties;

      const nextProperties = draftEntity.properties;

      // The only thing that has changed is the text entity within the legacy link,
      // so there is no update to this entity itself
      if (isEqual(previousProperties, nextProperties)) {
        continue;
      }

      actions.push({
        updateEntity: {
          entityId: draftEntity.metadata.recordId.entityId,
          properties: nextProperties,
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

      let entityTypeId: VersionedUrl | null = null;

      if (isDraftTextEntity(draftEntity)) {
        /**
         * Text types are built in, so we use our own text entity type ID
         */
        entityTypeId = textEntityTypeId;
      } else {
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

        const assumedEntityTypeId = getEntityTypeForComponent(
          blockEntity.componentId ?? "",
        );

        entityTypeId = assumedEntityTypeId;
      }

      const action: UpdatePageAction = {
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
  // First, gather the ids of the blocks as they appear in the db-persisted page
  const beforeBlockDraftIds = blocks.map((block) => {
    const draftEntity = getDraftEntityByEntityId(
      store.draft,
      block.metadata.recordId.entityId,
    );
    if (!draftEntity) {
      throw new Error("Draft entity missing");
    }

    return draftEntity.draftId;
  });

  const afterBlockDraftIds: string[] = [];

  // Check nodes in the ProseMirror document to gather the ids of the blocks as they appear in the latest page
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
        afterBlockDraftIds.push(draftEntity.draftId);
        return false;
      }
    }

    return true;
  });

  // Check the blocks from the db-persisted page against the latest version of the page
  let position = 0;
  let itCount = 0;
  // Move actions are order-sensitive, so we're going to sort them separately.
  const moveActions: UpdatePageAction[] = [];

  while (
    position < Math.max(beforeBlockDraftIds.length, afterBlockDraftIds.length)
  ) {
    itCount += 1;

    // @todo figure out a better safe guard against infinite loops
    if (itCount === 1000) {
      throw new Error("Max iteration count");
    }

    const afterDraftId = afterBlockDraftIds[position];
    const beforeDraftId = beforeBlockDraftIds[position];

    if (!beforeDraftId && !afterDraftId) {
      throw new Error("Cannot process block without draft id");
    }

    if (afterDraftId === beforeDraftId) {
      // the block id has not changed – but its child entity may have done, so we need to compare them

      const draftEntity = draftIdToBlockEntities.get(afterDraftId!); // asserted because we've just checked they're not both falsy
      if (!draftEntity) {
        throw new Error("missing draft block entity");
      }

      if (!draftEntity.metadata.recordId.entityId) {
        // The block has not yet been saved to the database, and therefore there is no saved block to compare it with
        // It's probably been inserted as part of this loop and spliced into the before ids – no further action required
        position += 1;
        continue;
      }

      const savedEntity = store.saved[draftEntity.metadata.recordId.entityId];
      if (!savedEntity) {
        throw new Error("missing saved block entity");
      }

      // extract the children for comparison
      const newChildEntityForBlock = draftEntity.blockChildEntity;
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

      position += 1;
      continue;
    }

    // the before draft id isn't the same as the after draft id, so this block shouldn't be in this position any more
    if (beforeDraftId) {
      moveActions.push({ removeBlock: { position } });

      // delete this block from the 'before' series so that we're comparing subsequent blocks in the correct position
      beforeBlockDraftIds.splice(position, 1);
    }

    // this block wasn't in this position before – it needs inserting there
    if (afterDraftId) {
      const draftEntity = draftIdToBlockEntities.get(afterDraftId);

      if (!draftEntity) {
        throw new Error("missing draft entity");
      }

      const blockData = draftEntity.blockChildEntity;
      const blockChildEntityId =
        blockData?.metadata.recordId.entityId ??
        draftIdToPlaceholderId.get(blockData!.draftId!);

      if (!blockChildEntityId) {
        throw new Error("Block data entity id missing");
      }

      const blockPlaceholderId = generatePlaceholderId();

      if (!draftEntity.metadata.recordId.entityId) {
        draftIdToPlaceholderId.set(draftEntity.draftId, blockPlaceholderId);
      }

      moveActions.push({
        insertBlock: {
          ownedById,
          position,
          entity: {
            // This cast is technically incorrect as the blockChildEntityId could be a placeholder.
            // In that case, we rely on the EntityId to be swapped out in the GQL resolver.
            existingEntityId: blockChildEntityId as EntityId,
          },
          ...(draftEntity.metadata.recordId.entityId
            ? {
                existingBlockEntityId: draftEntity.metadata.recordId.entityId,
              }
            : {
                blockPlaceholderId,
                componentId: draftEntity.componentId,
              }),
        },
      });

      // insert this new block into the 'before' series so that we compare subsequent blocks in the current position
      beforeBlockDraftIds.splice(position, 0, afterDraftId);
    }
  }

  actions.push(
    ...moveActions.filter((action) => action.removeBlock),
    ...moveActions.filter((action) => action.insertBlock),
  );

  const placeholderToDraft = flipMap(draftIdToPlaceholderId);

  return [actions, placeholderToDraft] as const;
};

const getDraftEntityIds = (
  placeholders: UpdatePageContentsResultPlaceholder[],
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

export const save = async (
  apolloClient: ApolloClient<unknown>,
  ownedById: OwnedById,
  pageEntityId: EntityId,
  doc: Node,
  store: EntityStore,
  blocksMap: () => ComponentIdHashBlockMap,
) => {
  const blocks = await apolloClient
    .query<GetPageQuery, GetPageQueryVariables>({
      query: getPageQuery,
      variables: { entityId: pageEntityId },
      fetchPolicy: "network-only",
    })
    .then((res) =>
      res.data.page.contents.map((contentItem) => contentItem.rightEntity),
    );

  // const entityTypeForComponentId = new Map<string, string>();

  const [actions, placeholderToDraft] = calculateSaveActions(
    store,
    ownedById,
    /**
     * If the text entity type is ever updated in the backend,
     * the FE will need to be redeployed to avoid this being out of sync.
     */
    TEXT_ENTITY_TYPE_ID,
    blocks,
    doc,
    /**
     * @todo Should the fallback be text here?
     */
    (componentId: string) => {
      return (blocksMap()[componentId]?.meta.schema ??
        TEXT_ENTITY_TYPE_ID) as VersionedUrl;
    },
  );

  let currentBlocks = blocks;
  let placeholders: UpdatePageContentsResultPlaceholder[] = [];

  if (actions.length > 0) {
    // Even if the actions list is empty, we hit the endpoint to get an updated
    // page result.
    const res = await apolloClient.mutate<
      UpdatePageContentsMutation,
      UpdatePageContentsMutationVariables
    >({
      variables: { entityId: pageEntityId, actions },
      mutation: updatePageContents,
    });

    if (!res.data) {
      throw new Error("Failed");
    }

    currentBlocks = res.data.updatePageContents.page.contents.map(
      (contentItem) => contentItem.rightEntity,
    );
    placeholders = res.data.updatePageContents.placeholders;
  }
  const draftToEntityId = getDraftEntityIds(placeholders, placeholderToDraft);

  return [currentBlocks, draftToEntityId] as const;
};
