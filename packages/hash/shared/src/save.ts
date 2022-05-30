import { ApolloClient } from "@apollo/client";
import { fetchBlockMeta } from "@hashintel/hash-shared/blockMeta";
import { getAccountEntityTypes } from "@hashintel/hash-shared/queries/entity.queries";
import { isEqual, omit } from "lodash";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { v4 as uuid } from "uuid";
import {
  BlockEntity,
  isDraftTextContainingEntityProperties,
  isDraftTextEntity,
} from "./entity";
import {
  DraftEntity,
  EntityStore,
  getDraftEntityFromEntityId,
  isDraftBlockEntity,
} from "./entityStore";
import {
  EntityTypeChoice,
  GetAccountEntityTypesSharedQuery,
  GetAccountEntityTypesSharedQueryVariables,
  SystemTypeName,
  UpdatePageAction,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
  UpdatePageContentsResultPlaceholder,
} from "./graphql/apiTypes.gen";
import { isEntityNode } from "./prosemirror";
import { updatePageContents } from "./queries/page.queries";

type EntityType =
  GetAccountEntityTypesSharedQuery["getAccountEntityTypes"][number];

/**
 * @todo this assumption of the slug might be brittle,
 * @todo don't copy from server
 */
const capitalizeComponentName = (cId: string) => {
  let componentId = cId;

  // If there's a trailing slash, remove it
  const indexLastSlash = componentId.lastIndexOf("/");
  if (indexLastSlash === componentId.length - 1) {
    componentId = componentId.slice(0, -1);
  }

  //                      *
  // "https://example.org/value"
  const indexAfterLastSlash = componentId.lastIndexOf("/") + 1;
  return (
    //                      * and uppercase it
    // "https://example.org/value"
    componentId.charAt(indexAfterLastSlash).toUpperCase() +
    //                       ****
    // "https://example.org/value"
    componentId.substring(indexAfterLastSlash + 1)
  );
};

const randomPlaceholder = () => `placeholder-${uuid()}`;

const flipMap = <K, V>(draftToPlaceholder: Map<K, V>): Map<V, K> =>
  new Map(
    Array.from(draftToPlaceholder, ([key, value]) => [value, key] as const),
  );

type EntityTypeForComponentResult = [string, UpdatePageAction[]];

const hasComponentId = (
  properties: unknown,
): properties is { componentId: string } =>
  typeof properties === "object" &&
  properties !== null &&
  "componentId" in properties &&
  typeof (properties as any).componentId === "string";

const ensureEntityTypeForComponent = async (
  componentId: string,
  newTypeAccountId: string,
  entityTypes: EntityType[],
  cache: Map<string, string>,
): Promise<EntityTypeForComponentResult> => {
  const actions: UpdatePageAction[] = [];

  let desiredEntityTypeId: string | undefined = cache.get(componentId);

  if (!desiredEntityTypeId) {
    desiredEntityTypeId = entityTypes.find(
      (type) =>
        hasComponentId(type.properties) &&
        type.properties.componentId === componentId,
    )?.entityId;
  }

  if (!desiredEntityTypeId) {
    const componentMeta = await fetchBlockMeta(componentId);
    const jsonSchema = JSON.parse(
      JSON.stringify(componentMeta.componentSchema),
    );

    delete jsonSchema.properties.editableRef;

    jsonSchema.componentId = componentId;

    desiredEntityTypeId = randomPlaceholder();

    actions.push({
      createEntityType: {
        accountId: newTypeAccountId,
        // @todo need to handle links better
        schema: jsonSchema,
        name: capitalizeComponentName(componentId),
        placeholderID: desiredEntityTypeId,
      },
    });
  }

  if (!desiredEntityTypeId) {
    throw new Error("Cannot find entity type for entity");
  }

  cache.set(componentId, desiredEntityTypeId);

  return [desiredEntityTypeId, actions];
};

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

  const draftToPlaceholder = new Map<string, string>();
  const draftBlockEntities = new Map<string, DraftEntity<BlockEntity>>();

  for (const draftEntity of Object.values(store.draft)) {
    if (isDraftBlockEntity(draftEntity)) {
      draftBlockEntities.set(draftEntity.draftId, draftEntity);
      continue;
    }

    if (draftEntity.entityId) {
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

      if (isDraftTextContainingEntityProperties(draftEntity.properties)) {
        const savedWithoutText = omit(savedEntity.properties, "text");
        const draftWithoutText = omit(draftEntity.properties, "text");
        const savedTextLink = isDraftTextContainingEntityProperties(
          savedEntity.properties,
        )
          ? savedEntity.properties.text.__linkedData
          : null;

        if (
          !isEqual(savedWithoutText, draftWithoutText) ||
          isEqual(savedTextLink, draftEntity.properties.text.__linkedData)
        ) {
          actions.push({
            updateEntity: {
              entityId: draftEntity.entityId,
              accountId: draftEntity.accountId,
              properties: {
                ...draftWithoutText,
                text: {
                  __linkedData: draftEntity.properties.text.__linkedData,
                },
              },
            },
          });
        }
      } else if (!isEqual(draftEntity.properties, savedEntity.properties)) {
        actions.push({
          updateEntity: {
            entityId: draftEntity.entityId,
            accountId: draftEntity.accountId,
            properties: draftEntity.properties,
          },
        });
      }
    } else {
      const placeholder = randomPlaceholder();
      draftToPlaceholder.set(draftEntity.draftId, placeholder);

      let entityType: EntityTypeChoice | null = null;
      let properties = draftEntity.properties;

      if (isDraftTextEntity(draftEntity)) {
        entityType = {
          systemTypeName: SystemTypeName.Text,
        };
      } else {
        const blockEntity = Object.values(store.draft).find(
          (entity): entity is DraftEntity<BlockEntity> =>
            isDraftBlockEntity(entity) &&
            entity.properties.entity.draftId === draftEntity.draftId,
        );

        if (!blockEntity) {
          throw new Error("Cannot find parent entity");
        }

        const [entityTypeId, newTypeActions] = await getEntityTypeForComponent(
          blockEntity.properties.componentId,
        );

        // Placing at front to ensure latter actions can make use of this
        actions.unshift(...newTypeActions);

        entityType = { entityTypeId };

        if (isDraftTextContainingEntityProperties(properties)) {
          const textEntity = properties.text.data;
          const textEntityId =
            draftToPlaceholder.get(textEntity.draftId) ?? textEntity.entityId;

          if (!textEntityId) {
            throw new Error("Entity for text not yet created");
          }

          properties = {
            ...properties,
            text: {
              __linkedData: {
                entityTypeId: textEntityTypeId,
                entityId: textEntityId,
              },
            },
          };
        }
      }

      actions.push({
        createEntity: {
          accountId,
          entity: {
            placeholderID: placeholder,
            versioned: true,
            entityType,
            entityProperties: properties,
          },
        },
      });
    }
  }

  const beforeBlockDraftIds = blocks.map((block) => {
    const draftEntity = getDraftEntityFromEntityId(store.draft, block.entityId);

    if (!draftEntity) {
      throw new Error("Draft entity missing");
    }

    return draftEntity.draftId;
  });

  const cloned = JSON.parse(JSON.stringify(beforeBlockDraftIds));

  const afterBlockDraftIds: string[] = [];

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
      position += 1;
      continue;
    }

    if (beforeDraftId) {
      actions.push({ removeBlock: { position } });
      beforeBlockDraftIds.splice(position, 1);
    }

    if (afterDraftId) {
      const draftEntity = draftBlockEntities.get(afterDraftId);

      if (!draftEntity) {
        throw new Error("missing draft entity");
      }

      const blockData = draftEntity.properties.entity;
      const dataEntityId =
        blockData.entityId ?? draftToPlaceholder.get(blockData.draftId);

      if (!dataEntityId) {
        throw new Error("Block data entity id missing");
      }

      const blockPlaceholder = randomPlaceholder();

      if (!draftEntity.entityId) {
        draftToPlaceholder.set(draftEntity.draftId, blockPlaceholder);
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
                placeholderID: blockPlaceholder,
                componentId: draftEntity.properties.componentId,
              }),
        },
      });
      beforeBlockDraftIds.splice(position, 0, afterDraftId);
    }
  }
  const placeholderToDraft = flipMap(draftToPlaceholder);

  return [actions, placeholderToDraft] as const;
};

// @todo rename/inline
const updateEntityIdsForPlaceholders = (
  placeholders: UpdatePageContentsResultPlaceholder[],
  placeholderToDraft: Map<string, string>,
) => {
  const result: Record<string, string> = {};

  for (const placeholder of placeholders) {
    const draftId = placeholderToDraft.get(placeholder.placeholderID);
    if (draftId) {
      result[draftId] = placeholder.entityID;
    }
  }

  return result;
};

// @todo write tests
export const save = async (
  apolloClient: ApolloClient<unknown>,
  accountId: string,
  pageEntityId: string,
  blocks: BlockEntity[],
  doc: ProsemirrorNode<Schema>,
  store: EntityStore,
) => {
  // @todo can these be cached at all?
  const entityTypesResult = await apolloClient.query<
    GetAccountEntityTypesSharedQuery,
    GetAccountEntityTypesSharedQueryVariables
  >({
    query: getAccountEntityTypes,
    variables: { accountId, includeOtherTypesInUse: true },
    fetchPolicy: "network-only",
  });

  const entityTypes = entityTypesResult.data.getAccountEntityTypes;

  /**
   * @todo shouldn't need an existing text entity to find this
   */
  const textEntityTypeId = entityTypes.find(
    (type) => type.properties.title === "Text",
  )?.entityId;

  if (!textEntityTypeId) {
    throw new Error("No text entities exist. Cannot find text entity type id");
  }

  const entityTypeForComponentId = new Map<string, string>();

  const [actions, placeholderToDraft] = await calculateSaveActions(
    store,
    accountId,
    textEntityTypeId,
    blocks,
    doc,
    async (componentId: string) =>
      await ensureEntityTypeForComponent(
        componentId,
        accountId,
        entityTypes,
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

  const draftToEntityId = updateEntityIdsForPlaceholders(
    res.data.updatePageContents.placeholders,
    placeholderToDraft,
  );

  return [
    res.data.updatePageContents.page.properties.contents,
    draftToEntityId,
  ] as const;
};
