import { Draft, produce } from "immer";
import { isEqual } from "lodash";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { v4 as uuid } from "uuid";
import { BlockEntity, isDraftTextContainingEntityProperties } from "./entity";
import {
  createEntityStore,
  DraftEntity,
  draftEntityForEntityId,
  EntityStore,
  EntityStoreType,
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
  trackedActions: { action: EntityStorePluginAction; id: string }[];
};

export type EntityStorePluginAction = { received?: boolean } & (
  | /**
   * This is an action that merges in a new set of blocks from a Page
   * entity's contents property, usually post save while attempting to
   * remember draft data which has not yet been saved. This is not a
   * fool-proof solution, and is only necessary because we don't yet
   * convert the changes made during a save into discrete actions. Once
   * we do that, we should remove this as its a source of complexity and
   * bugs. It also results in needing to send the entire store to the
   * other clients, as it is not sync-able.
   *
   * @deprecated
   * @todo remove this once we better handle saves
   */
  {
      type: "mergeNewPageContents";
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
        accountId: string;
        draftId: string;
        entityId: string | null;
      };
    }
  | {
      type: "updateEntityId";
      payload: {
        draftId: string;
        entityId: string;
      };
    }
  | {
      type: "updateBlockEntityProperties";
      payload: { blockEntitydraftId: string; targetEntity: EntityStoreType };
    }
);

const entityStorePluginKey = new PluginKey<EntityStorePluginState, Schema>(
  "entityStore",
);

type EntityStoreMeta = {
  store?: EntityStorePluginState;
  disableInterpretation?: boolean;
};

const getMeta = (
  transaction: Transaction<Schema>,
): EntityStoreMeta | undefined => transaction.getMeta(entityStorePluginKey);

const setMeta = (transaction: Transaction<Schema>, meta: EntityStoreMeta) =>
  transaction.setMeta(entityStorePluginKey, meta);

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
export const entityStorePluginStateFromTransaction = (
  tr: Transaction<Schema>,
  state: EditorState<Schema>,
): EntityStorePluginState =>
  getMeta(tr)?.store ?? entityStorePluginState(state);

export const newDraftId = () => `fake-${uuid()}`;

export const draftIdForEntity = (entityId: string) => `draft-${entityId}`;

/**
 * As we're not yet working with a totally flat entity store, the same
 * entity can exist in multiple places in a draft entity store. This
 * function finds each instance of an entity by entity id, and calls a
 * handler which can mutate this entity. This will ensure a desired update
 * is applied everywhere that's necessary.
 *
 * @todo look into removing this when the entity store is flat
 */
const updateEntitiesByDraftId = (
  draftEntityStore: Draft<EntityStore["draft"]>,
  draftId: string,
  updateHandler: (entity: Draft<DraftEntity>) => void,
) => {
  const entities: Draft<DraftEntity>[] = [draftEntityStore[draftId]!];

  for (const entity of Object.values(draftEntityStore)) {
    if (isDraftBlockEntity(entity)) {
      if (entity.properties.entity.draftId === draftId) {
        entities.push(entity.properties.entity);
      }

      if (
        isDraftTextContainingEntityProperties(
          entity.properties.entity.properties,
        ) &&
        entity.properties.entity.properties.text.data.draftId === draftId
      ) {
        entities.push(entity.properties.entity.properties.text.data);
      }
    }
  }

  for (const entity of entities) {
    updateHandler(entity);
  }
};

/**
 * The method does the following
 * 1. Fetches the targetEntity from draft store if it exists and adds it to draft store if it's not present
 * 2. Sets targetEntity as the new block data
 * @param draftEntityStore draft entity store
 * @param blockEntityDraftId draft id of the Block Entity whose child entity should be changed
 * @param targetEntity entity to be changed to
 */
const updateBlockEntity = (
  draftEntityStore: Draft<EntityStore["draft"]>,
  blockEntityDraftId: string,
  targetEntity: EntityStoreType,
) => {
  let targetDraftEntity = draftEntityForEntityId(
    draftEntityStore,
    targetEntity.entityId,
  );

  // Add target entity to draft store if it is not
  // present there
  // @todo consider moving this to updateBlockData
  if (!targetDraftEntity) {
    const targetEntityDraftId = newDraftId();
    targetDraftEntity = {
      accountId: targetEntity.accountId,
      draftId: targetEntityDraftId,
      entityId: targetEntity.entityId,
      properties: targetEntity.properties,
      // might not need this?
      entityVersionCreatedAt: new Date().toISOString(),
    };

    draftEntityStore[targetEntityDraftId] = targetDraftEntity;
  }

  const draftBlockEntity = draftEntityStore[blockEntityDraftId];

  // these two conditionals can be merged into 1
  if (!draftBlockEntity) {
    throw new Error("Block to update not present in store");
  }

  if (!isDraftBlockEntity(draftBlockEntity)) {
    throw new Error("draftId provided does not point to a BlockEntity");
  }

  // we shouldn't need to update this since the api is meant to
  // handle it.
  // @todo remove the need for this
  // draftBlockEntity.entityVersionCreatedAt = new Date().toISOString();

  draftBlockEntity.properties.entity = targetDraftEntity;
};

/**
 * We currently violate Immer's rules, as properties inside entities can be
 * other entities themselves, and we expect `entity.property.entity` to be
 * the same object as the other entity. We either need to change that, or
 * remove immer, or both.
 *
 * @todo address this
 * @see https://immerjs.github.io/immer/pitfalls#immer-only-supports-unidirectional-trees
 *
 * @todo reduce duplication
 */
const entityStoreReducer = (
  state: EntityStorePluginState,
  action: EntityStorePluginAction,
): EntityStorePluginState => {
  switch (action.type) {
    case "mergeNewPageContents":
      return {
        ...state,
        store: createEntityStore(action.payload, state.store.draft),
      };

    case "store": {
      return {
        ...state,
        store: action.payload,
        trackedActions: [],
      };
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
        if (!action.received) {
          draftState.trackedActions.push({ action, id: uuid() });
        }

        updateEntitiesByDraftId(
          draftState.store.draft,
          action.payload.draftId,
          action.payload.merge
            ? (draftEntity) => {
                Object.assign(
                  draftEntity.properties,
                  action.payload.properties,
                );
              }
            : (draftEntity) => {
                draftEntity.properties = action.payload.properties;
              },
        );
      });
    }

    case "updateBlockEntityProperties": {
      if (!state.store.draft[action.payload.blockEntitydraftId]) {
        throw new Error(
          `Block missing to merge entity properties -> ${action.payload.blockEntitydraftId}`,
        );
      }

      if (!action.payload.targetEntity) {
        throw new Error("Entity missing to update Block data");
      }

      return produce(state, (draftState) => {
        if (!action.received) {
          draftState.trackedActions.push({ action, id: uuid() });
        }

        updateBlockEntity(
          draftState.store.draft,
          action.payload.blockEntitydraftId,
          action.payload.targetEntity,
        );
      });
    }

    case "updateEntityId": {
      if (!state.store.draft[action.payload.draftId]) {
        throw new Error("Entity missing to update entity id");
      }

      return produce(state, (draftState) => {
        if (!action.received) {
          draftState.trackedActions.push({ action, id: uuid() });
        }

        updateEntitiesByDraftId(
          draftState.store.draft,
          action.payload.draftId,
          (draftEntity: Draft<DraftEntity>) => {
            draftEntity.entityId = action.payload.entityId;
          },
        );
      });
    }

    case "newDraftEntity":
      if (state.store.draft[action.payload.draftId]) {
        throw new Error("Draft entity already exists");
      }

      return produce(state, (draftState) => {
        if (!action.received) {
          draftState.trackedActions.push({ action, id: uuid() });
        }

        draftState.store.draft[action.payload.draftId] = {
          accountId: action.payload.accountId,
          entityId: action.payload.entityId,
          draftId: action.payload.draftId,
          entityVersionCreatedAt: new Date().toISOString(),
          properties: {},
        };
      });
  }

  return state;
};

export const disableEntityStoreTransactionInterpretation = (
  tr: Transaction<Schema>,
) => {
  setMeta(tr, {
    ...(getMeta(tr) ?? {}),
    disableInterpretation: true,
  });
};

/**
 * @todo store actions on transaction
 */
export const addEntityStoreAction = (
  state: EditorState<Schema>,
  tr: Transaction<Schema>,
  action: EntityStorePluginAction,
) => {
  const prevState = entityStorePluginStateFromTransaction(tr, state);
  const nextState = entityStoreReducer(prevState, action);
  setMeta(tr, {
    ...(getMeta(tr) ?? {}),
    store: nextState,
  });

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

  constructor(private state: EditorState<Schema>, private accountId: string) {
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
        const componentNodeChild = findComponentNodes(node)[0];

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
        /**
         * @todo this is communicated by the contents of the
         * prosemirror tree – do we really need to send this too?
         */
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
        node.attrs.draftId ?? newDraftId();

    if (!draftEntityStore[draftId]) {
      addEntityStoreAction(this.state, this.tr, {
        type: "newDraftEntity",
        payload: {
          accountId: this.accountId,
          draftId,
          entityId: entityId ?? null,
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
    return entityStorePluginStateFromTransaction(this.tr, this.state).store
      .draft;
  }
}

/**
 * This is used by entityStorePlugin to notify any listeners to the plugin that
 * a state has changed. This needs to happen at the end of a tick to ensure that
 * Prosemirror is in a consistent and stable state before the subscriber is
 * notified as the subscriber may then query Prosemirror which could cause a
 * crash if Prosemirror is either not in a consistent state yet, or if the view
 * state and the state used to notify the subscribers are not in sync.
 *
 * We schedule the notification using the view and not the current state, as
 * the view state may change in between when its scheduled and when the
 * notification occurs, and we want to ensure we only notify with the final
 * view state in a tick. Intermediary states are not notified for.
 */
const scheduleNotifyEntityStoreSubscribers = collect<
  [
    view: EditorView<Schema>,
    prevState: EditorState<Schema>,
    entityStorePlugin: Plugin<EntityStorePluginState, Schema>,
  ]
>((calls) => {
  for (const [view, prevState, entityStorePlugin] of calls) {
    const nextPluginState = entityStorePlugin.getState(view.state);
    const prevPluginState = entityStorePlugin.getState(prevState);

    // If the plugin state has changed, notify listeners
    if (nextPluginState !== prevPluginState) {
      for (const listener of nextPluginState.listeners) {
        listener(nextPluginState.store);
      }
    }
  }
});

export const createEntityStorePlugin = ({ accountId }: { accountId: string }) =>
  new Plugin<EntityStorePluginState, Schema>({
    key: entityStorePluginKey,
    state: {
      init(_): EntityStorePluginState {
        return {
          store: createEntityStore([], {}),
          listeners: [],
          trackedActions: [],
        };
      },
      apply(tr, initialState): EntityStorePluginState {
        return getMeta(tr)?.store ?? initialState;
      },
    },

    view() {
      return {
        update: (view, prevState) => {
          scheduleNotifyEntityStoreSubscribers(
            view,
            prevState,
            createEntityStorePlugin({ accountId }),
          );
        },
      };
    },

    /**
     * This is necessary to ensure the draft entity store stays in sync with the
     * changes made by users to the document
     *
     * @todo we need to take the state left by the transactions as the start
     * for nodeChangeHandler
     */
    appendTransaction(transactions, _, state) {
      if (!transactions.some((tr) => tr.docChanged)) {
        return;
      }

      if (
        getMeta(transactions[transactions.length - 1]!)?.disableInterpretation
      ) {
        return;
      }

      return new ProsemirrorStateChangeHandler(state, accountId).handleDoc();
    },
  });
