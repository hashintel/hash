import { Draft, produce } from "immer";
import { Schema } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { v4 as uuid } from "uuid";
import { BlockEntity } from "./entity";
import {
  createEntityStore,
  draftEntityForEntityId,
  EntityStore,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entityStore";
import { ProsemirrorNode } from "./node";
import {
  componentNodeToId,
  EntityNode,
  isComponentNode,
  isEntityNode,
  nodeToEntityProperties,
} from "./prosemirror";

type EntityStorePluginState = {
  store: EntityStore;
  decorations: DecorationSet<Schema>;
};

type EntityStorePluginAction =
  | {
      type: "contents";
      payload: BlockEntity[];
    }
  | {
      type: "draft";
      payload: EntityStore["draft"];
    }
  | { type: "store"; payload: EntityStore };

type EntityStorePluginMessage = EntityStorePluginAction[];

export const entityStorePluginKey = new PluginKey<
  EntityStorePluginState,
  Schema
>("entityStore");

export const addEntityStoreAction = (
  tr: Transaction<Schema>,
  action: EntityStorePluginAction
) => {
  const actions: EntityStorePluginMessage =
    tr.getMeta(entityStorePluginKey) ?? [];

  tr.setMeta(entityStorePluginKey, [...actions, action]);
};

export const entityStoreFromProsemirror = (state: EditorState<Schema>) => {
  const pluginState = entityStorePluginKey.getState(state);

  if (!pluginState) {
    throw new Error(
      "Cannot process transaction when state does not have entity store plugin",
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
  entities: BlockEntity[],
) => {
  const { tr } = state;

  /**
   * @todo we should remove this action once its been applied
   * @todo this is a pretty crude way of getting a store – why not just call
   *       it directly?
   */
  addEntityStoreAction(tr, { type: "contents", payload: entities });

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
  addEntityStoreAction(tr, { type: "store", payload: store });

  return { store, tr };
};

const draftIdForNode = (
  tr: Transaction<Schema>,
  node: EntityNode,
  pos: number,
  draftDraftEntityStore: Draft<EntityStore["draft"]>,
) => {
  let draftId = node.attrs.draftId;

  if (draftId && draftDraftEntityStore[draftId]) {
    if (node.attrs.entityId) {
      const existingDraftId = draftEntityForEntityId(
        draftDraftEntityStore,
        node.attrs.entityId,
      )?.draftId;

      if (!existingDraftId) {
        throw new Error("invariant: entity missing from entity store");
      }

      draftId = existingDraftId;
    }
  } else {
    /**
     * @todo this will lead to the frontend setting draft id uuids for new
     *       blocks – this is potentially insecure and needs considering
     */
    draftId ??= uuid();

    draftDraftEntityStore[draftId] = {
      draftId,
      entityId: null,
      properties: {},
    };
  }

  if (draftId !== node.attrs.draftId) {
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      draftId,
    });
  }

  return draftId;
};

/**
 * As updates to plugin state don't necessarily trigger updates on the
 * blocks that rely on them, we need a mechanism to force that. We're doing that
 * for component nodes here by applying a random decoration around them which
 * will trigger ComponentView to be updated.
 *
 * @warning Other views that use the entity store will need their own mechanism
 *          to trigger updates.
 * @todo    we need an explicit way of subscribing to the entity store
 */
const decorationSet = (doc: ProsemirrorNode<Schema>) => {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (isComponentNode(node)) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {}, { entityStoreId: uuid() })
      );

      return false;
    }

    return true;
  });

  return DecorationSet.create<Schema>(doc, decorations);
};

export const entityStorePlugin = new Plugin<EntityStorePluginState, Schema>({
  key: entityStorePluginKey,
  state: {
    init(_, state) {
      return {
        store: createEntityStore([], {}),
        decorations: decorationSet(state.doc),
      };
    },
    apply(tr, initialState) {
      const actions: EntityStorePluginMessage =
        tr.getMeta(entityStorePluginKey) ?? [];

      return actions.reduce<EntityStorePluginState>(
        (state, action) => {
          /**
           * A more efficient thing to do would be to work out which entities this
           * action changes, and only update the decorations for the entities that
           * have changed
           */
          const decorations = decorationSet(tr.doc);

          switch (action.type) {
            case "contents":
              return {
                ...state,
                store: createEntityStore(action.payload, state.store.draft),
                decorations,
              };

            case "draft":
              return {
                ...state,
                store: {
                  ...state.store,
                  draft: action.payload,
                  decorations,
                },
              };

            case "store": {
              return { ...state, store: action.payload, decorations };
            }
          }

          return state;
        },
        {
          ...initialState,
          decorations: initialState.decorations.map(tr.mapping, tr.doc),
        }
      );
    },
  },

  props: {
    decorations(state) {
      return entityStoreFromProsemirror(state).decorations;
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

    /**
     * We current violate Immer's rules, as properties inside entities can be
     * other entities themselves, and we expect `entity.property.entity` to be
     * the same object as the other entity. We either need to change that, or
     * remove immer, or both.
     *
     * @todo address this
     * @see https://immerjs.github.io/immer/pitfalls#immer-only-supports-unidirectional-trees
     */
    const nextDraft = produce(prevDraft, (draftDraftEntityStore) => {
      state.doc.descendants((node, pos) => {
        if (isComponentNode(node)) {
          let blockEntityNode: EntityNode | null = null;
          const resolved = tr.doc.resolve(pos);
          for (let depth = 0; depth < resolved.depth; depth++) {
            const parentNode = resolved.node(depth);
            if (isEntityNode(parentNode)) {
              blockEntityNode = parentNode;
              break;
            }
          }

          if (!blockEntityNode) {
            throw new Error("invariant: unexpected structure");
          }

          if (blockEntityNode.attrs.draftId) {
            const entity = draftDraftEntityStore[blockEntityNode.attrs.draftId];

            if (!entity || !isBlockEntity(entity)) {
              throw new Error(
                "Block entity node points at non-block entity in draft store",
              );
            }

            entity.properties.componentId = componentNodeToId(node);
          }
        }

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

    addEntityStoreAction(tr, { type: "draft", payload: nextDraft });

    return tr;
  },
});
