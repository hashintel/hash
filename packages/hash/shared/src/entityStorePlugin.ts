import { ProsemirrorNode } from "@hashintel/hash-shared/node";
import { Draft, produce } from "immer";
import { isEqual } from "lodash";
import { Schema } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { v4 as uuid } from "uuid";
import { BlockEntity } from "./entity";
import {
  createEntityStore,
  DraftEntity,
  draftEntityForEntityId,
  EntityStore,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entityStore";
import {
  ComponentNode,
  componentNodeToId,
  EntityNode,
  findComponentNodes,
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
      // @todo remove this
      type: "contents";
      payload: BlockEntity[];
    }
  | { type: "store"; payload: EntityStore }
  | { type: "subscribe"; payload: EntityStorePluginStateListener }
  | { type: "unsubscribe"; payload: EntityStorePluginStateListener }
  | {
      type: "updateEntityProperties";
      payload: { draftId: string; properties: {}; merge: boolean };
    }
  | {
      type: "newDraftEntity";
      payload: {
        entityId: string | null;
        draftId: string;
      };
    };

const entityStorePluginKey = new PluginKey<EntityStorePluginState, Schema>(
  "entityStore",
);

/**
 * @use {@link subscribeToEntityStore} if you need a live subscription
 */
export const entityStorePluginState = (state: EditorState<Schema>) => {
  const pluginState = entityStorePluginKey.getState(state);

  if (!pluginState) {
    throw new Error(
      "Cannot get entity store when state does not have entity store plugin",
    );
  }
  return pluginState;
};

/**
 * @use {@link subscribeToEntityStore} if you need a live subscription
 */
export const pluginStateFromTransaction = (
  tr: Transaction<Schema>,
  state: EditorState<Schema>,
): EntityStorePluginState =>
  tr.getMeta(entityStorePluginKey) ?? entityStorePluginState(state);

/**
 * We currently violate Immer's rules, as properties inside entities can be
 * other entities themselves, and we expect `entity.property.entity` to be
 * the same object as the other entity. We either need to change that, or
 * remove immer, or both.
 *
 * @todo address this
 * @see https://immerjs.github.io/immer/pitfalls#immer-only-supports-unidirectional-trees
 */
const entityStoreReducer = (
  state: EntityStorePluginState,
  action: EntityStorePluginAction,
): EntityStorePluginState => {
  switch (action.type) {
    case "contents":
      return {
        ...state,
        store: createEntityStore(action.payload, state.store.draft),
      };

    case "store": {
      return { ...state, store: action.payload };
    }

    case "subscribe":
      return {
        ...state,
        listeners: Array.from(new Set([...state.listeners, action.payload])),
      };

    case "unsubscribe":
      return {
        ...state,
        listeners: state.listeners.filter(
          (listener) => listener !== action.payload,
        ),
      };

    case "updateEntityProperties": {
      if (!state.store.draft[action.payload.draftId]) {
        throw new Error("Entity missing to merge entity properties");
      }

      return produce(state, (draftState) => {
        const entities: Draft<DraftEntity>[] = [
          draftState.store.draft[action.payload.draftId],
        ];

        for (const entity of Object.values(draftState.store.draft)) {
          if (
            isDraftBlockEntity(entity) &&
            entity.properties.entity.draftId === action.payload.draftId
          ) {
            entities.push(entity.properties.entity);
          }
        }

        if (action.payload.merge) {
          for (const entity of entities) {
            Object.assign(entity.properties, action.payload.properties);
          }
        } else {
          for (const entity of entities) {
            entity.properties = action.payload.properties;
          }
        }
      });
    }
    case "newDraftEntity":
      if (state.store.draft[action.payload.draftId]) {
        throw new Error("Draft entity already exists");
      }

      return produce(state, (draftState) => {
        draftState.store.draft[action.payload.draftId] = {
          entityId: action.payload.entityId,
          draftId: action.payload.draftId,
          properties: {},
        };
      });
  }

  return state;
};

export const addEntityStoreAction = (
  state: EditorState<Schema>,
  tr: Transaction<Schema>,
  action: EntityStorePluginAction,
) => {
  const prevState = pluginStateFromTransaction(tr, state);
  const nextState = entityStoreReducer(prevState, action);

  tr.setMeta(entityStorePluginKey, nextState);

  return nextState;
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

    addEntityStoreAction(view.state, tr, {
      type: unsubscribe ? "unsubscribe" : "subscribe",
      payload: listener,
    });
  }

  for (const [view, transaction] of Array.from(transactions.entries())) {
    view.dispatch(transaction);
  }
});

export const subscribeToEntityStore = (
  view: EditorView<Schema>,
  listener: EntityStorePluginStateListener,
) => {
  updateEntityStoreListeners(view, listener);

  return () => {
    updateEntityStoreListeners(view, listener, true);
  };
};

const getDraftIdFromEntityByEntityId = (
  draftStore: EntityStore["draft"],
  entityId: string,
) => {
  const existingEntity = draftEntityForEntityId(draftStore, entityId);

  if (!existingEntity) {
    throw new Error("invariant: entity missing from entity store");
  }

  return existingEntity.draftId;
};

const getRequiredDraftIdFromEntityNode = (entityNode: EntityNode): string => {
  if (!entityNode.attrs.draftId) {
    throw new Error("Draft id missing when expected");
  }

  return entityNode.attrs.draftId;
};

class ProsemirrorStateChangeHandler {
  private readonly tr: Transaction<Schema>;
  private handled = false;

  constructor(private state: EditorState<Schema>) {
    this.tr = state.tr;
  }

  handleDoc() {
    if (this.handled) {
      throw new Error("already used");
    }

    this.handled = true;

    this.tr.doc.descendants((node, pos) => {
      this.handleNode(node, pos);
    });

    return this.tr;
  }

  private handleNode(node: ProsemirrorNode<Schema>, pos: number) {
    if (isComponentNode(node)) {
      this.componentNode(node, pos);
    }

    if (isEntityNode(node)) {
      this.entityNode(node, pos);
    }
  }

  private componentNode(node: ComponentNode, pos: number) {
    let blockEntityNode: EntityNode | null = null;
    const resolved = this.tr.doc.resolve(pos);
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
      const draftEntityStore = this.getDraftEntityStoreFromTransaction();
      const entity = draftEntityStore[blockEntityNode.attrs.draftId];

      if (!entity || !isBlockEntity(entity)) {
        throw new Error(
          "Block entity node points at non-block entity in draft store",
        );
      }

      const componentId = componentNodeToId(node);

      if (entity.properties.componentId !== componentId) {
        addEntityStoreAction(this.state, this.tr, {
          type: "updateEntityProperties",
          payload: {
            merge: true,
            draftId: entity.draftId,
            properties: { componentId },
          },
        });
      }
    }
  }

  private entityNode(node: EntityNode, pos: number) {
    const updatedNode = this.potentialNewDraftEntityForEntityNode(node, pos);

    this.handlePotentialTextContentChangesInEntityNode(updatedNode);
  }

  private potentialUpdateParentBlockEntity(node: EntityNode, pos: number) {
    const parent = this.tr.doc.resolve(pos).parent;

    if (isEntityNode(parent)) {
      const parentDraftId = parent.attrs.draftId;
      if (!parentDraftId) {
        throw new Error("invariant: parents must have a draft id");
      }

      const draftEntityStore = this.getDraftEntityStoreFromTransaction();
      const parentEntity = draftEntityStore[parentDraftId];
      if (!parentEntity) {
        throw new Error("invariant: parent node missing from draft store");
      }

      // @todo in what circumstances does this occur
      if (!isDraftBlockEntity(parentEntity)) {
        const componentNodeChild = findComponentNodes(node)[0][0];

        addEntityStoreAction(this.state, this.tr, {
          type: "updateEntityProperties",
          payload: {
            merge: false,
            draftId: parentEntity.draftId,
            properties: {
              entity: draftEntityStore[getRequiredDraftIdFromEntityNode(node)],
              /**
               * We don't currently rely on componentId of the draft
               * right
               * now, but this will be a problem in the future (i.e, if
               * save starts using the draft entity store)
               *
               * @todo set this properly
               */
              componentId: componentNodeChild
                ? componentNodeToId(componentNodeChild)
                : "",
            },
          },
        });
      }
    }
  }

  private handlePotentialTextContentChangesInEntityNode(node: EntityNode) {
    const draftEntityStore = this.getDraftEntityStoreFromTransaction();
    const draftEntity =
      draftEntityStore[getRequiredDraftIdFromEntityNode(node)];

    if (!draftEntity) {
      throw new Error("invariant: draft entity missing from store");
    }

    if (
      "properties" in draftEntity &&
      node.firstChild &&
      node.firstChild.isTextblock
    ) {
      const nextProps = textBlockNodeToEntityProperties(node.firstChild);

      if (!isEqual(draftEntity.properties, nextProps)) {
        addEntityStoreAction(this.state, this.tr, {
          type: "updateEntityProperties",
          payload: {
            merge: false,
            draftId: draftEntity.draftId,
            properties: nextProps,
          },
        });
      }
    }
  }

  private potentialDraftIdSetForEntityNode(node: EntityNode, pos: number) {
    const draftEntityStore = this.getDraftEntityStoreFromTransaction();

    const entityId = node.attrs.draftId
      ? draftEntityStore[node.attrs.draftId]?.entityId
      : null;

    const draftId = entityId
      ? getDraftIdFromEntityByEntityId(draftEntityStore, entityId)
      : /**
         * @todo this will lead to the frontend setting draft id uuids for
         *   new blocks – this is potentially insecure and needs
         *   considering
         */
        node.attrs.draftId ?? `fake-${uuid()}`;

    if (!draftEntityStore[draftId]) {
      addEntityStoreAction(this.state, this.tr, {
        type: "newDraftEntity",
        payload: {
          entityId: entityId ?? null,
          draftId,
        },
      });
    }

    /**
     * @todo need to ensure we throw away now unused draft entities
     * @todo does this ever happen now? We're trying to make it so draftId
     * never changes
     */
    if (draftId !== node.attrs.draftId) {
      this.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        draftId,
      });
    }
  }

  private potentialNewDraftEntityForEntityNode(
    node: EntityNode,
    pos: number,
  ): EntityNode {
    this.potentialDraftIdSetForEntityNode(node, pos);

    const updatedNode = this.tr.doc.resolve(this.tr.mapping.map(pos)).nodeAfter;

    if (!updatedNode || !isEntityNode(updatedNode)) {
      throw new Error("Node missing in transaction");
    }

    this.potentialUpdateParentBlockEntity(updatedNode, pos);

    return updatedNode;
  }

  private getDraftEntityStoreFromTransaction() {
    return pluginStateFromTransaction(this.tr, this.state).store.draft;
  }
}

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
      const nextState: EntityStorePluginState =
        tr.getMeta(entityStorePluginKey) ?? initialState;

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

    return new ProsemirrorStateChangeHandler(state).handleDoc();
  },
});
