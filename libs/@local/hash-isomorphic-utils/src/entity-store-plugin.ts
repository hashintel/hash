import { EntityId, EntityPropertiesObject } from "@local/hash-subgraph";
import { Draft, produce } from "immer";
import { isEqual } from "lodash";
import { Node } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { v4 as uuid } from "uuid";

import { BlockEntity, getEntityChildEntity, isTextEntity } from "./entity";
import {
  createEntityStore,
  DraftEntity,
  EntityStore,
  EntityStoreType,
  getDraftEntityByEntityId,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entity-store";
import {
  ComponentNode,
  componentNodeToId,
  EntityNode,
  findComponentNodes,
  isComponentNode,
  isEntityNode,
} from "./prosemirror";
import { textBlockNodeToEntityProperties } from "./text";
import { collect } from "./util";

type EntityStorePluginStateListener = (store: EntityStore) => void;

export type TrackedAction = { action: EntityStorePluginAction; id: string };
type EntityStorePluginState = {
  store: EntityStore;
  trackedActions: TrackedAction[];
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
      payload: {
        blocks: BlockEntity[];
        presetDraftIds: Record<string, string>;
      };
    }
  | { type: "store"; payload: EntityStore }
  | {
      type: "updateEntityProperties";
      payload: {
        draftId: string;
        merge: boolean;
      } & (
        | {
            blockEntityMetadata: {
              componentId: string;
              blockChildEntity?: { [key: string]: unknown };
            };
          }
        | { properties: { [key: string]: unknown } }
      );
    }
  | {
      type: "newDraftEntity";
      payload: {
        accountId: string;
        draftId: string;
        entityId: EntityId | null;
      };
    }
  | {
      type: "setBlockChildEntity";
      payload: { blockEntityDraftId: string; targetEntity: EntityStoreType };
    }
);

const EntityStoreListeners = new WeakMap<
  Plugin<EntityStorePluginState>,
  Set<EntityStorePluginStateListener>
>();

const entityStorePluginKey = new PluginKey<EntityStorePluginState>(
  "entityStore",
);

type EntityStoreMeta = {
  store?: EntityStorePluginState;
  disableInterpretation?: boolean;
};

const getMeta = (transaction: Transaction): EntityStoreMeta | undefined =>
  transaction.getMeta(entityStorePluginKey);

const setMeta = (transaction: Transaction, meta: EntityStoreMeta) =>
  transaction.setMeta(entityStorePluginKey, meta);

/**
 * @use {@link subscribeToEntityStore} if you need a live subscription
 */
export const entityStorePluginState = (state: EditorState) => {
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
  tr: Transaction,
  state: EditorState,
): EntityStorePluginState =>
  getMeta(tr)?.store ?? entityStorePluginState(state);

/**
 * Creates a draftId for an entity.
 * If the entityId is not yet available, a fake draft id is used for the session.
 * Pass 'null' if the entity is new and the entityId is not available.
 * Do NOT change the entity's draftId mid-session - leave it as fake.
 * If you need to recall the entity's draftId, use mustGetDraftEntityForEntityId
 */
export const generateDraftIdForEntity = (entityId: EntityId | null) =>
  entityId ? `draft-${entityId}-${uuid()}` : `fake-${uuid()}`;

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
      // This type is very deep now, so traversal causes TS to complain.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const blockChildEntity = entity.blockChildEntity!;
      if (blockChildEntity.draftId && blockChildEntity.draftId === draftId) {
        entities.push(blockChildEntity as DraftEntity);
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
const setBlockChildEntity = (
  draftEntityStore: Draft<EntityStore["draft"]>,
  blockEntityDraftId: string,
  targetEntity: EntityStoreType,
) => {
  let targetDraftEntity = getDraftEntityByEntityId(
    draftEntityStore,
    targetEntity.metadata.recordId.entityId,
  );

  // Add target entity to draft store if it is not
  // present there
  // @todo consider moving this to ProseMirrorSchemaManager.updateBlockData
  if (!targetDraftEntity) {
    const targetEntityDraftId = generateDraftIdForEntity(
      targetEntity.metadata.recordId.entityId,
    );
    targetDraftEntity = {
      metadata: {
        recordId: {
          entityId: targetEntity.metadata.recordId.entityId,
        },
      },
      draftId: targetEntityDraftId,
      properties: targetEntity.properties,
      /** @todo use the actual updated date here https://app.asana.com/0/0/1203099452204542/f */
      // updatedAt: targetEntity.updatedAt,
    };

    draftEntityStore[targetEntityDraftId] = targetDraftEntity;
  }

  const draftBlockEntity = draftEntityStore[blockEntityDraftId];

  if (!isDraftBlockEntity(draftBlockEntity)) {
    throw new Error(
      `BlockEntity not present in draft store. Draft Id => ${blockEntityDraftId}`,
    );
  }

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
        store: createEntityStore(
          action.payload.blocks,
          state.store.draft,
          action.payload.presetDraftIds,
        ),
      };

    case "store": {
      return {
        ...state,
        store: action.payload,
        trackedActions: [],
      };
    }

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
          (draftEntity) => {
            if ("blockEntityMetadata" in action.payload) {
              draftEntity.componentId =
                action.payload.blockEntityMetadata.componentId;
              draftEntity.blockChildEntity = action.payload.blockEntityMetadata
                .blockChildEntity as any;
            }

            if ("properties" in action.payload) {
              if (action.payload.merge) {
                Object.assign(
                  draftEntity.properties,
                  action.payload.properties,
                );
              } else {
                draftEntity.properties = action.payload
                  .properties as EntityPropertiesObject;
              }
            }
          },
        );
      });
    }

    case "setBlockChildEntity": {
      if (!state.store.draft[action.payload.blockEntityDraftId]) {
        throw new Error(
          `Block missing to merge entity properties -> ${action.payload.blockEntityDraftId}`,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
      if (!action.payload.targetEntity) {
        throw new Error("Entity missing to update Block data");
      }

      return produce(state, (draftState) => {
        if (!action.received) {
          draftState.trackedActions.push({ action, id: uuid() });
        }

        setBlockChildEntity(
          draftState.store.draft,
          action.payload.blockEntityDraftId,
          action.payload.targetEntity,
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
          metadata: {
            recordId: {
              entityId: action.payload.entityId,
            },
          },
          draftId: action.payload.draftId,
          properties: {},
        };
      });
  }

  return state;
};

export const disableEntityStoreTransactionInterpretation = (
  tr: Transaction,
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
  state: EditorState,
  tr: Transaction,
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
    view: EditorView,
    listener: EntityStorePluginStateListener,
    unsubscribe: boolean | undefined | void,
  ]
>((updates) => {
  for (const [view, listener, unsubscribe] of updates) {
    const plugin = entityStorePluginKey.get(view.state);

    if (!plugin) {
      throw new Error("Can only trigger on views with the plugin installed");
    }

    let listeners = EntityStoreListeners.get(plugin);

    if (unsubscribe) {
      if (listeners) {
        listeners.delete(listener);
      }
    } else {
      listeners ??= new Set();

      listeners.add(listener);
    }

    if (listeners) {
      EntityStoreListeners.set(plugin, listeners);
    }
  }
});

export const subscribeToEntityStore = (
  view: EditorView,
  listener: EntityStorePluginStateListener,
) => {
  updateEntityStoreListeners(view, listener);

  return () => {
    updateEntityStoreListeners(view, listener, true);
  };
};

/**
 * Retrieves the draft entity for an entity, given its entityId and the draft store.
 * @throws {Error} if entity not found - use getDraftEntityForEntityId if you don't want an error on missing entities.
 */
export const mustGetDraftEntityByEntityId = (
  draftStore: EntityStore["draft"],
  entityId: EntityId,
) => {
  const existingEntity = getDraftEntityByEntityId(draftStore, entityId);

  if (!existingEntity) {
    throw new Error("invariant: entity missing from entity store");
  }

  return existingEntity;
};

const getRequiredDraftIdFromEntityNode = (entityNode: EntityNode): string => {
  if (!entityNode.attrs.draftId) {
    throw new Error("Draft id missing when expected");
  }

  return entityNode.attrs.draftId;
};

class ProsemirrorStateChangeHandler {
  private readonly tr: Transaction;
  private handled = false;

  constructor(private state: EditorState, private accountId: string) {
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

  private handleNode(node: Node, pos: number) {
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

      if (entity.componentId !== componentId) {
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
        const componentId = componentNodeChild
          ? componentNodeToId(componentNodeChild)
          : "";

        addEntityStoreAction(this.state, this.tr, {
          type: "updateEntityProperties",
          payload: {
            merge: false,
            draftId: parentEntity.draftId,
            blockEntityMetadata: {
              blockChildEntity:
                draftEntityStore[getRequiredDraftIdFromEntityNode(node)],
              componentId,
            },
          },
        });
      }
    }
  }

  private handlePotentialTextContentChangesInEntityNode(node: EntityNode) {
    const draftEntityStore = this.getDraftEntityStoreFromTransaction();
    const childEntity = getEntityChildEntity(
      getRequiredDraftIdFromEntityNode(node),
      draftEntityStore,
    );

    if (!childEntity) {
      return;
    }
    // We should currently be
    //          here V
    // Block -> Entity -> Entity -> Component node
    //  firstChild refers to ^
    //  firstchild.firstChild refers to  ^
    // and we'd like to update the child entity's text contents approrpiately.

    if (
      isTextEntity(childEntity) &&
      node.firstChild &&
      node.firstChild.firstChild &&
      // Check if the next next entity node's child is a component node
      isComponentNode(node.firstChild.firstChild)
    ) {
      const nextProps = textBlockNodeToEntityProperties(node.firstChild);

      if (!isEqual(childEntity.properties, nextProps)) {
        addEntityStoreAction(this.state, this.tr, {
          type: "updateEntityProperties",
          payload: {
            merge: false,
            draftId: childEntity.draftId,
            properties: nextProps,
          },
        });
      }
    }
  }

  private potentialDraftIdSetForEntityNode(node: EntityNode, pos: number) {
    const draftEntityStore = this.getDraftEntityStoreFromTransaction();

    const entityId = node.attrs.draftId
      ? draftEntityStore[node.attrs.draftId]?.metadata.recordId.entityId
      : null;

    const draftId = entityId
      ? mustGetDraftEntityByEntityId(draftEntityStore, entityId).draftId
      : /**
         * @todo this will lead to the frontend setting draft id uuids for
         *   new blocks – this is potentially insecure and needs
         *   considering
         */
        node.attrs.draftId ?? generateDraftIdForEntity(null);

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
    view: EditorView,
    prevState: EditorState,
    entityStorePlugin: Plugin<EntityStorePluginState>,
  ]
>((calls) => {
  for (const [view, prevState, entityStorePlugin] of calls) {
    const nextPluginState = entityStorePlugin.getState(view.state);
    const prevPluginState = entityStorePlugin.getState(prevState);

    // If the plugin state has changed, notify listeners
    if (nextPluginState && nextPluginState !== prevPluginState) {
      const listeners = EntityStoreListeners.get(entityStorePlugin);

      if (listeners) {
        for (const listener of Array.from(listeners)) {
          listener(nextPluginState.store);
        }
      }
    }
  }
});

export const createEntityStorePlugin = ({
  accountId,
}: {
  accountId: string;
}) => {
  const entityStorePlugin = new Plugin<EntityStorePluginState>({
    key: entityStorePluginKey,
    state: {
      init(_): EntityStorePluginState {
        return {
          store: createEntityStore([], {}),
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
            entityStorePlugin,
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
  return entityStorePlugin;
};
