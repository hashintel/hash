import { ApolloClient } from "@apollo/client";
import { isEqual, pick } from "lodash";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { v4 as uuid } from "uuid";

import {
  BlockEntity,
  isDraftTextEntity,
  isTextEntity,
  isTextProperties,
  LegacyLink,
} from "./entity";
import {
  DraftEntity,
  EntityStore,
  getDraftEntityByEntityId,
  isDraftBlockEntity,
  TEXT_TOKEN_PROPERTY_TYPE_ID,
} from "./entityStore";
import {
  GetPersistedPageQuery,
  GetPersistedPageQueryVariables,
  Text,
  EntityTypeChoice,
  UpdatePersistedPageContentsMutation,
  UpdatePersistedPageContentsMutationVariables,
  UpdatePersistedPageAction,
  UpdatePersistedPageContentsResultPlaceholder,
} from "./graphql/apiTypes.gen";
import { isEntityNode } from "./prosemirror";
import {
  getPersistedPageQuery,
  updatePersistedPageContents,
} from "./queries/page.queries";

const generatePlaceholderId = () => `placeholder-${uuid()}`;

const flipMap = <K, V>(map: Map<K, V>): Map<V, K> =>
  new Map(Array.from(map, ([key, value]) => [value, key] as const));

type EntityTypeForComponentResult = [string, UpdatePersistedPageAction[]];

/**
 * Given the entity 'store', the 'blocks' persisted to the database, and the PromiseMirror 'doc',
 * determines what changes are needed to persist changes to the database.
 */
const calculateSaveActions = async (
  store: EntityStore,
  _accountId: string,
  _textEntityTypeId: string,
  _blocks: BlockEntity[],
  _doc: ProsemirrorNode<Schema>,
  _getEntityTypeForComponent: (
    componentId: string,
  ) => Promise<EntityTypeForComponentResult>,
) => {
  const actions: UpdatePersistedPageAction[] = [];

  const draftIdToPlaceholderId = new Map<string, string>();
  const draftIdToBlockEntities = new Map<string, DraftEntity<BlockEntity>>();

  console.debug("Wannasave", { store: store.draft });

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

      const previousProperties = savedEntity.properties;

      const nextProperties = draftEntity.properties;

      // The only thing that has changed is the text entity within the legacy link,
      // so there is no update to this entity itself
      if (isEqual(previousProperties, nextProperties)) {
        continue;
      }

      actions.push({
        updateEntity: {
          entityId: draftEntity.entityId,
          ownedById: draftEntity.accountId,
          properties: nextProperties,
        },
      });
    }
  }

  const placeholderToDraft = flipMap(draftIdToPlaceholderId);

  return [actions, placeholderToDraft] as const;
};

const getDraftEntityIds = (
  placeholders: UpdatePersistedPageContentsResultPlaceholder[],
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
  ownedById: string,
  pageEntityId: string,
  doc: ProsemirrorNode<Schema>,
  store: EntityStore,
) => {
  const blocks = await apolloClient
    .query<GetPersistedPageQuery, GetPersistedPageQueryVariables>({
      query: getPersistedPageQuery,
      variables: { ownedById, entityId: pageEntityId },
      fetchPolicy: "network-only",
    })
    .then((res) => res.data.persistedPage.contents);

  // const entityTypeForComponentId = new Map<string, string>();
  const [actions, placeholderToDraft] = await calculateSaveActions(
    store,
    ownedById,
    /** @todo This type ID should *not* be hardcoded as is here. */
    TEXT_TOKEN_PROPERTY_TYPE_ID,
    /**
     * @todo this any type coercion is incorrect, we need to adjust typings https://app.asana.com/0/0/1203099452204542/f
     * Note that this code path isn't run in the current state of collab. (frontend never triggers changes)
     */
    blocks as any,
    doc,
    async (componentId: string) => [componentId, []],
    // await ensureEntityTypeForComponent(
    //   apolloClient,
    //   componentId,
    //   accountId,
    //   entityTypeForComponentId,
    // ),
  );
  console.debug("SAVE ACTIONS", actions);

  const res = await apolloClient.mutate<
    UpdatePersistedPageContentsMutation,
    UpdatePersistedPageContentsMutationVariables
  >({
    variables: { ownedById, entityId: pageEntityId, actions },
    mutation: updatePersistedPageContents,
  });

  if (!res.data) {
    throw new Error("Failed");
  }

  // await apolloClient.reFetchObservableQueries();

  const draftToEntityId = getDraftEntityIds(
    res.data.updatePersistedPageContents.placeholders,
    placeholderToDraft,
  );

  return [
    res.data.updatePersistedPageContents.page.contents,
    draftToEntityId,
  ] as const;
};
