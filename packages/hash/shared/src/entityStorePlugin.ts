import { Draft, produce } from "immer";
import { Schema } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { v4 as uuid } from "uuid";
import { BlockEntity } from "./entity";
import {
  createEntityStore,
  EntityStore,
  isDraftBlockEntity,
} from "./entityStore";
import {
  EntityNode,
  isEntityNode,
  nodeToEntityProperties,
} from "./prosemirror";

type EntityStorePluginState = { store: EntityStore };

type EntityStorePluginMessage =
  | {
      type: "contents";
      payload: BlockEntity[];
    }
  | {
      type: "draft";
      payload: EntityStore["draft"];
    }
  | { type: "store"; payload: EntityStore };

const entityStorePluginKey = new PluginKey<EntityStorePluginState, Schema>(
  "entityStore"
);

export const entityStoreFromProsemirror = (state: EditorState<Schema>) => {
  const pluginState = entityStorePluginKey.getState(state);

  if (!pluginState) {
    throw new Error(
      "Cannot process transaction when state does not have entity store plugin"
    );
  }
  return pluginState;
};

/**
 * When updating the view with a new set of entities, we need a draft store
 * to construct the Prosemirror nodes for. However, the process of creating
 * a draft store for a set of entities involves generating random IDs, and
 * the only way we have of doing it is by dispatching a transaction with a
 * certain meta key. Therefore we need to create a copy of the state with the
 * transaction setting the meta key, and then "remember" the entity store
 * that we create by setting another meta key.
 *
 * We additionally remove the draftIds that should have had entities created
 * for them on the last save, to prepare for correcting them in the plugin
 *
 * @todo it would be nice if this weren't necessary. It's an implementation
 *       detail of the plugin that consumers shouldn't care about
 */
export const entityStoreAndTransactionForEntities = (
  state: EditorState<Schema>,
  entities: BlockEntity[]
) => {
  const { tr } = state;

  tr.setMeta(entityStorePluginKey, { type: "contents", payload: entities });

  /**
   * We need to remove the draft ids were previously generated for nodes
   * that did not yet have entity ids, so that the draft ids created when we
   * updated with the new entities can be matched to the nodes representing
   * those entities (in appendTransaction).
   */
  tr.doc.descendants((node, pos) => {
    if (
      node.type === state.schema.nodes.entity &&
      node.attrs.draftId &&
      !node.attrs.entityId
    ) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        draftId: null,
      });
    }
  });

  /**
   * Create a copy of the prosemirror state with the above transaction
   * applied to, in order to get the entity store for this set of entities,
   * without yet dispatching the transaction
   */
  const { store } = entityStoreFromProsemirror(state.apply(tr));

  /**
   * We've generated a new entity store for the new set of entities, but we need
   * to ensure that when the transaction that uses this entity store is
   * dispatched, that that entity store overwrites the one currently stored in
   * Prosemirror, as the use of state.apply above does not actually replace the
   * store inside Prosemirror
   */
  tr.setMeta(entityStorePluginKey, { type: "store", payload: store });

  return { store, tr };
};

const draftIdForNode = (
  tr: Transaction<Schema>,
  node: EntityNode,
  pos: number,
  draftDraftEntityStore: Draft<EntityStore["draft"]>
) => {
  let draftId = node.attrs.draftId;

  if (!draftId) {
    if (node.attrs.entityId) {
      const existingDraftId = Object.values(draftDraftEntityStore).find(
        (entity) => entity.entityId === node.attrs.entityId
      )?.draftId;

      if (!existingDraftId) {
        throw new Error("invariant: entity missing from entity store");
      }

      draftId = existingDraftId;
    } else {
      draftId = uuid();
      /**
       * @todo how do we ensure this is the same on frontend and on
       *       collab
       */
      draftDraftEntityStore[draftId] = {
        draftId,
        entityId: null,
        properties: {},
      };
    }

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      draftId,
    });
  }

  return draftId;
};

export const entityStorePlugin = new Plugin<EntityStorePluginState, Schema>({
  key: entityStorePluginKey,
  state: {
    init() {
      return {
        store: createEntityStore([], {}),
      };
    },
    apply(tr, value) {
      const action: EntityStorePluginMessage | undefined =
        tr.getMeta(entityStorePluginKey);

      if (action) {
        switch (action.type) {
          case "contents":
            return {
              store: createEntityStore(action.payload, value.store.draft),
            };

          case "draft":
            return {
              store: {
                ...value.store,
                draft: action.payload,
              },
            };

          case "store": {
            return { store: action.payload };
          }
        }
      }

      return value;
    },
  },

  /**
   * This is necessary to ensure the draft entity store stays in sync with the
   * changes made by users to the document
   */
  appendTransaction(transactions, _, state) {
    if (!transactions.some((tr) => tr.docChanged)) {
      return;
    }

    const pluginState = entityStoreFromProsemirror(state);
    const prevDraft = pluginState.store.draft;
    const { tr } = state;

    const nextDraft = produce(prevDraft, (draftDraftEntityStore) => {
      state.doc.descendants((node, pos) => {
        if (!isEntityNode(node)) {
          return;
        }

        const draftId = draftIdForNode(tr, node, pos, draftDraftEntityStore);
        const draftEntity = draftDraftEntityStore[draftId];

        if (!draftEntity) {
          throw new Error("invariant: draft entity missing from store");
        }

        if ("properties" in draftEntity && node.firstChild) {
          draftEntity.properties = nodeToEntityProperties(node.firstChild);
        }

        const parent = tr.doc.resolve(pos).parent;

        if (!isEntityNode(parent)) {
          return;
        }

        const parentDraftId = parent.attrs.draftId;

        if (!parentDraftId) {
          throw new Error("invariant: parents must have a draft id");
        }

        const parentEntity = draftDraftEntityStore[parentDraftId];

        if (!parentEntity) {
          throw new Error("invariant: parent node missing from draft store");
        }

        if (!isDraftBlockEntity(parentEntity)) {
          draftDraftEntityStore[parentEntity.draftId] = {
            ...parentEntity,
            properties: {
              entity: draftEntity,
              /**
               * We don't currently rely on componentId of the draft right
               * now, but this will be a problem in the future (i.e, if save
               * starts using the draft entity store)
               *
               * @todo set this properly
               */
              componentId: "",
            },
          };
        }
      });
    });

    tr.setMeta(entityStorePluginKey, { type: "draft", payload: nextDraft });

    return tr;
  },
});
