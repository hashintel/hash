import { Draft, produce } from "immer";
import { Schema } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { v4 as uuid } from "uuid";
import { BlockEntity } from "./entity";
import {
  createEntityStore,
  draftEntityForEntityId,
  draftIdForEntityId,
  EntityStore,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entityStore";
import {
  componentNodeToId,
  EntityNode,
  isComponentNode,
  isEntityNode,
  textBlockNodeToEntityProperties,
} from "./prosemirror";
import { collect } from "./util";

type EntityStorePluginStateListener = (store: EntityStore) => void;

type EntityStorePluginState = {
  store: EntityStore;
  listeners: EntityStorePluginStateListener[];
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
  | { type: "store"; payload: EntityStore }
  | { type: "subscribe"; payload: EntityStorePluginStateListener }
  | { type: "unsubscribe"; payload: EntityStorePluginStateListener };

type EntityStorePluginMessage = EntityStorePluginAction[];

const entityStorePluginKey = new PluginKey<EntityStorePluginState, Schema>(
  "entityStore",
);

export const addEntityStoreAction = (
  tr: Transaction<Schema>,
  action: EntityStorePluginAction,
) => {
  const actions: EntityStorePluginMessage =
    tr.getMeta(entityStorePluginKey) ?? [];

  tr.setMeta(entityStorePluginKey, [...actions, action]);
};

const updateEntityStoreListeners = collect<
  [
    view: EditorView<Schema>,
    listener: EntityStorePluginStateListener,
    unsubscribe: boolean | undefined | void,
  ]
>((updates) => {
  const transactions = new Map<EditorView<Schema>, Transaction<Schema>>();

  for (const [view, listener, unsubscribe] of updates) {
    if (!transactions.has(view)) {
      const { tr } = view.state;
      tr.setMeta("addToHistory", false);
      transactions.set(view, tr);
    }

    const tr = transactions.get(view)!;

    addEntityStoreAction(tr, {
      type: unsubscribe ? "unsubscribe" : "subscribe",
      payload: listener,
    });
  }

  for (const [view, transaction] of Array.from(transactions.entries())) {
    view.dispatch(transaction);
  }
});

/**
 * @use subscribeToEntityStore if you need a live subscription
 */
export const entityStorePluginState = (state: EditorState<Schema>) => {
  const pluginState = entityStorePluginKey.getState(state);

  if (!pluginState) {
    throw new Error(
      "Cannot process transaction when state does not have entity store plugin",
    );
  }
  return pluginState;
};

export const subscribeToEntityStore = (
  view: EditorView<Schema>,
  listener: EntityStorePluginStateListener,
) => {
  updateEntityStoreListeners(view, listener);

  return () => {
    updateEntityStoreListeners(view, listener, true);
  };
};

const draftIdForNode = (
  tr: Transaction<Schema>,
  node: EntityNode,
  pos: number,
  draftDraftEntityStore: Draft<EntityStore["draft"]>,
) => {
  let draftId = node.attrs.draftId;

  if (draftId && draftDraftEntityStore[draftId]) {
    const entityId = draftDraftEntityStore[draftId].entityId;

    if (entityId) {
      const existingDraftId = draftEntityForEntityId(
        draftDraftEntityStore,
        entityId,
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
    draftId ??= draftIdForEntityId(uuid());

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

export const entityStorePlugin = new Plugin<EntityStorePluginState, Schema>({
  key: entityStorePluginKey,
  state: {
    init(_): EntityStorePluginState {
      return {
        store: createEntityStore([], {}),
        listeners: [],
      };
    },
    apply(tr, initialState): EntityStorePluginState {
      const actions: EntityStorePluginMessage =
        tr.getMeta(entityStorePluginKey) ?? [];

      const nextState = actions.reduce(
        (state, action): EntityStorePluginState => {
          switch (action.type) {
            case "contents":
              return {
                ...state,
                store: createEntityStore(action.payload, state.store.draft),
              };

            case "draft":
              return {
                ...state,
                store: {
                  ...state.store,
                  draft: action.payload,
                },
              };

            case "store": {
              return { ...state, store: action.payload };
            }

            case "subscribe":
              return {
                ...state,
                listeners: Array.from(
                  new Set([...state.listeners, action.payload]),
                ),
              };

            case "unsubscribe":
              return {
                ...state,
                listeners: state.listeners.filter(
                  (listener) => listener !== action.payload,
                ),
              };
          }

          return state;
        },
        initialState,
      );

      if (nextState !== initialState) {
        for (const listener of nextState.listeners) {
          listener(nextState.store);
        }
      }

      return nextState;
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

    const pluginState = entityStorePluginState(state);
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

        if (
          "properties" in draftEntity &&
          node.firstChild &&
          node.firstChild.isTextblock
        ) {
          draftEntity.properties = textBlockNodeToEntityProperties(
            node.firstChild,
          );
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
