import { ApolloClient, ApolloError } from "@apollo/client";
import { fetchBlock } from "@hashintel/hash-shared/blocks";
import {
  BlockEntity,
  isDraftTextContainingEntityProperties,
  isDraftTextEntity,
  LegacyLink,
} from "@hashintel/hash-shared/entity";
import {
  DraftEntity,
  EntityStore,
  getDraftEntityByEntityId,
  isDraftBlockEntity,
} from "@hashintel/hash-shared/entityStore";
import { isEntityNode } from "@hashintel/hash-shared/prosemirror";
import { isEqual, pick } from "lodash";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { v4 as uuid } from "uuid";
import {
  EntityTypeChoice,
  DeprecatedGetComponentEntityTypeQuery,
  DeprecatedGetComponentEntityTypeQueryVariables,
  GetPageQuery,
  GetPageQueryVariables,
  DeprecatedGetTextEntityTypeQuery,
  DeprecatedGetTextEntityTypeQueryVariables,
  SystemTypeName,
  Text,
  UpdatePageAction,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
  UpdatePageContentsResultPlaceholder,
} from "../graphql/apiTypes.gen";
import { capitalizeComponentName } from "../util";
import {
  deprecatedGetComponentEntityType,
  deprecatedGetTextEntityType,
} from "./graphql/queries/entityType.queries";
import {
  getPageQuery,
  updatePageContents,
} from "./graphql/queries/page.queries";

const generatePlaceholderId = () => `placeholder-${uuid()}`;

const flipMap = <K, V>(map: Map<K, V>): Map<V, K> =>
  new Map(Array.from(map, ([key, value]) => [value, key] as const));

type EntityTypeForComponentResult = [string, UpdatePageAction[]];

const ensureEntityTypeForComponent = async (
  apolloClient: ApolloClient<unknown>,
  componentId: string,
  newTypeAccountId: string,
  cache: Map<string, string>,
): Promise<EntityTypeForComponentResult> => {
  const actions: UpdatePageAction[] = [];

  let desiredEntityTypeId: string | undefined = cache.get(componentId);

  if (!desiredEntityTypeId) {
    desiredEntityTypeId = await apolloClient
      .query<
        DeprecatedGetComponentEntityTypeQuery,
        DeprecatedGetComponentEntityTypeQueryVariables
      >({
        query: deprecatedGetComponentEntityType,
        variables: { componentId },
      })
      .then((res) => res.data.deprecatedGetEntityType.entityId)
      .catch((err) => {
        if (
          err instanceof ApolloError &&
          err.graphQLErrors.length === 1 &&
          err.graphQLErrors[0] &&
          err.graphQLErrors[0].extensions?.code === "NOT_FOUND"
        ) {
          return undefined;
        }

        throw err;
      });
  }

  if (!desiredEntityTypeId) {
    const block = await fetchBlock(componentId);
    const jsonSchema = JSON.parse(JSON.stringify(block.schema));

    jsonSchema.componentId = componentId;

    desiredEntityTypeId = generatePlaceholderId();

    actions.push({
      createEntityType: {
        accountId: newTypeAccountId,
        // @todo need to handle links better
        schema: jsonSchema,
        name: capitalizeComponentName(componentId),
        placeholderId: desiredEntityTypeId,
      },
    });
  }

  if (!desiredEntityTypeId) {
    throw new Error("Cannot find entity type for entity");
  }

  cache.set(componentId, desiredEntityTypeId);

  return [desiredEntityTypeId, actions];
};

/**
 * Given the entity 'store', the 'blocks' persisted to the database, and the PromiseMirror 'doc',
 * determines what changes are needed to persist changes to the database.
 */
const calculateSaveActions = async (
  store: EntityStore,
  accountId: string,
  textEntityTypeId: string,
  blocks: BlockEntity[],
  doc: ProsemirrorNode<Schema>,
  getEntityTypeForComponent: (
    componentId: string,
  ) => Promise<EntityTypeForComponentResult>,
) => {
  const actions: UpdatePageAction[] = [];

  const draftIdToPlaceholderId = new Map<string, string>();
  const draftIdToBlockEntities = new Map<string, DraftEntity<BlockEntity>>();

  /**
   * In some cases, in order to update an entity, we need to create a legacy link
   * within the properties to link it to the relevant text entity. This sometimes
   * involves creating a new text entity, which will be done later, but we need
   * to decide its placeholder entity id now in order to generate the correct link
   */
  const ensureNecessaryLegacyTextLink = <
    T extends { text: LegacyLink<DraftEntity<Text>> },
  >(
    properties: T,
  ): Pick<LegacyLink<DraftEntity<Text>>, "__linkedData"> => {
    if (
      properties.text.__linkedData.entityId &&
      properties.text.__linkedData.entityTypeId
    ) {
      return pick(properties.text, "__linkedData");
    }

    const textEntity = properties.text.data;
    let textEntityId =
      draftIdToPlaceholderId.get(textEntity.draftId) ?? textEntity.entityId;

    if (!textEntityId) {
      textEntityId = generatePlaceholderId();
      draftIdToPlaceholderId.set(textEntity.draftId, textEntityId);
    }

    return {
      __linkedData: {
        entityTypeId: textEntityTypeId,
        entityId: textEntityId,
      },
    };
  };

  // Check the entities in the draft entity store against their representation (if any) in the database
  for (const draftEntity of Object.values(store.draft)) {
    if (isDraftBlockEntity(draftEntity)) {
      // Draft blocks are checked for updates separately, after this loop
      draftIdToBlockEntities.set(draftEntity.draftId, draftEntity);
      continue;
    }

    if (draftEntity.entityId) {
      // This means the entity already exists, but may need updating
      const savedEntity = store.saved[draftEntity.entityId];

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

      const previousProperties = isDraftTextContainingEntityProperties(
        savedEntity.properties,
      )
        ? {
            ...savedEntity.properties,
            text: pick(savedEntity.properties.text, "__linkedData"),
          }
        : savedEntity.properties;

      const nextProperties = isDraftTextContainingEntityProperties(
        draftEntity.properties,
      )
        ? {
            ...draftEntity.properties,
            text: ensureNecessaryLegacyTextLink(draftEntity.properties),
          }
        : draftEntity.properties;

      // The only thing that has changed is the text entity within the legacy link,
      // so there is no update to this entity itself
      if (isEqual(previousProperties, nextProperties)) {
        continue;
      }

      actions.push({
        updateEntity: {
          entityId: draftEntity.entityId,
          accountId: draftEntity.accountId,
          properties: nextProperties,
        },
      });
    } else {
      // We need to create the entity, and possibly a new entity type too

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

      let entityType: EntityTypeChoice | null = null;
      let properties = draftEntity.properties;

      if (isDraftTextEntity(draftEntity)) {
        /**
         * Text types are built in, so we know in this case we don't need to
         * create an entity type, and we know we don't need to deal with any
         * legacy links
         */
        entityType = {
          systemTypeName: SystemTypeName.Text,
        };
      } else {
        /**
         * At this point, we may need to create an entity type for the entity
         * we want to insert, which can also require dealing with legacy links
         */
        const blockEntity = Object.values(store.draft).find(
          (entity): entity is DraftEntity<BlockEntity> =>
            isDraftBlockEntity(entity) &&
            entity.properties.entity.draftId === draftEntity.draftId,
        );

        if (!blockEntity) {
          throw new Error("Cannot find parent entity");
        }

        const [entityTypeId, newTypeActions] = await getEntityTypeForComponent(
          /** @todo this string type coercion may be incorrect, we need to adjust typings https://app.asana.com/0/0/1203099452204542/f */
          blockEntity.componentId as string,
        );

        entityType = { entityTypeId };
        // Placing at front to ensure latter actions can make use of this type
        actions.unshift(...newTypeActions);

        properties = isDraftTextContainingEntityProperties(properties)
          ? {
              ...properties,
              text: ensureNecessaryLegacyTextLink(properties),
            }
          : properties;
      }

      const action: UpdatePageAction = {
        createEntity: {
          accountId,
          entityPlaceholderId: placeholderId,
          entity: {
            versioned: true,
            entityType,
            entityProperties: properties,
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
        const idx = actions.findIndex((item) => !item.createEntityType);
        actions.splice(idx === -1 ? 0 : idx, 0, action);
      } else {
        actions.push(action);
      }
    }
  }

  // Having dealt with non-block entities, now we check for changes in the blocks themselves
  // Block entities are wrappers which point to (a) a component and (b) a child entity
  // First, gather the ids of the blocks as they appear in the db-persisted page
  const beforeBlockDraftIds = blocks.map((block) => {
    const draftEntity = getDraftEntityByEntityId(store.draft, block.entityId);

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

      if (!draftEntity.entityId) {
        // The block has not yet been saved to the database, and therefore there is no saved block to compare it with
        // It's probably been inserted as part of this loop and spliced into the before ids – no further action required
        position += 1;
        continue;
      }

      const savedEntity = store.saved[draftEntity.entityId];
      if (!savedEntity) {
        throw new Error("missing saved block entity");
      }

      // extract the children for comparison
      const newChildEntityForBlock = draftEntity.properties.entity;
      if (!("entity" in savedEntity.properties)) {
        throw new Error("Missing child entity in saved block entity");
      }

      const oldChildEntityForBlock = savedEntity.properties.entity;

      if (oldChildEntityForBlock.entityId !== newChildEntityForBlock.entityId) {
        if (!newChildEntityForBlock.entityId) {
          // this should never happen because users select new child entities from API-provided entities.
          // if this errors in future, it's because users are choosing locally-created but not yet db-persisted entities
          throw new Error("New child entity for block has not yet been saved");
        }

        actions.push({
          swapBlockData: {
            accountId: draftEntity.accountId,
            entityId: savedEntity.entityId,
            newEntityEntityId: newChildEntityForBlock.entityId,
            newEntityAccountId: newChildEntityForBlock.accountId,
          },
        });
      }

      position += 1;
      continue;
    }

    // the before draft id isn't the same as the after draft id, so this block shouldn't be in this position any more
    if (beforeDraftId) {
      actions.push({ removeBlock: { position } });

      // delete this block from the 'before' series so that we're comparing subsequent blocks in the correct position
      beforeBlockDraftIds.splice(position, 1);
    }

    // this block wasn't in this position before – it needs inserting there
    if (afterDraftId) {
      const draftEntity = draftIdToBlockEntities.get(afterDraftId);

      if (!draftEntity) {
        throw new Error("missing draft entity");
      }

      const blockData = draftEntity.properties.entity;
      const dataEntityId =
        blockData.entityId ?? draftIdToPlaceholderId.get(blockData.draftId);

      if (!dataEntityId) {
        throw new Error("Block data entity id missing");
      }

      const blockPlaceholderId = generatePlaceholderId();

      if (!draftEntity.entityId) {
        draftIdToPlaceholderId.set(draftEntity.draftId, blockPlaceholderId);
      }

      actions.push({
        insertBlock: {
          accountId: draftEntity.accountId,
          position,
          entity: {
            existingEntity: {
              accountId: blockData.accountId,
              entityId: dataEntityId,
            },
          },
          ...(draftEntity.entityId
            ? {
                existingBlockEntity: {
                  accountId: draftEntity.accountId,
                  entityId: draftEntity.entityId,
                },
              }
            : {
                blockPlaceholderId,
                componentId: draftEntity.properties.componentId,
              }),
        },
      });

      // insert this new block into the 'before' series so that we compare subsequent blocks in the current position
      beforeBlockDraftIds.splice(position, 0, afterDraftId);
    }
  }
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
  accountId: string,
  pageEntityId: string,
  doc: ProsemirrorNode<Schema>,
  store: EntityStore,
) => {
  const [blocks, textEntityTypeId] = await Promise.all([
    apolloClient
      .query<GetPageQuery, GetPageQueryVariables>({
        query: getPageQuery,
        variables: { accountId, entityId: pageEntityId },
        fetchPolicy: "network-only",
      })
      .then((res) => res.data.page.contents),
    apolloClient
      .query<
        DeprecatedGetTextEntityTypeQuery,
        DeprecatedGetTextEntityTypeQueryVariables
      >({
        query: deprecatedGetTextEntityType,
      })
      .then((res) => res.data.deprecatedGetEntityType.entityId)
      .catch(() => {
        throw new Error("Cannot find text entity type id");
      }),
  ]);

  const entityTypeForComponentId = new Map<string, string>();

  const [actions, placeholderToDraft] = await calculateSaveActions(
    store,
    accountId,
    textEntityTypeId,
    /**
     * @todo this any type coercion is incorrect, we need to adjust typings https://app.asana.com/0/0/1203099452204542/f
     * Note that this code path isn't run in the current state of collab. (frontend never triggers changes)
     */
    blocks as any,
    doc,
    async (componentId: string) =>
      await ensureEntityTypeForComponent(
        apolloClient,
        componentId,
        accountId,
        entityTypeForComponentId,
      ),
  );

  const res = await apolloClient.mutate<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >({
    variables: { actions, accountId, entityId: pageEntityId },
    mutation: updatePageContents,
  });

  if (!res.data) {
    throw new Error("Failed");
  }

  await apolloClient.reFetchObservableQueries();

  const draftToEntityId = getDraftEntityIds(
    res.data.updatePageContents.placeholders,
    placeholderToDraft,
  );

  return [res.data.updatePageContents.page.contents, draftToEntityId] as const;
};
