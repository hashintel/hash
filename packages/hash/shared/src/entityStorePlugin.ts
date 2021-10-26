import { produce } from "immer";
import { Schema } from "prosemirror-model";
import { EditorState, Plugin, PluginKey, Transaction } from "prosemirror-state";
import { v4 as uuid } from "uuid";
import { BlockEntity } from "./entity";
import { createEntityStore, EntityStore } from "./entityStore";
import { nodeToEntityProperties } from "./save";

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
 * to construct the Prosemirror nodes for. However,
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
  appendTransaction(_, __, state) {
    const pluginState = entityStoreFromProsemirror(state);
    const prevDraft = pluginState.store.draft;

    let tr: Transaction<Schema> | undefined;

    const newDraft = produce(prevDraft, (draft) => {
      state.doc.descendants((node, pos, parent) => {
        if (node.type === state.schema.nodes.entity) {
          let draftId = node.attrs.draftId;
          if (!draftId) {
            if (node.attrs.entityId) {
              const existingDraftId = Object.values(prevDraft).find(
                (entity) => entity.entityId === node.attrs.entityId
              )?.draftId;

              if (!existingDraftId) {
                throw new Error(
                  "invariant: entity missing from saved entity store"
                );
              }

              draftId = existingDraftId;
            } else {
              /**
               * @todo how do we ensure this is the same on frontend and on
               *       collab
               */
              draftId = uuid();
              draft[draftId] = {
                draftId,
                // @todo make this ok
                entityId: null,
                properties: {},
              };
            }

            if (!tr) {
              tr = state.tr;
            }

            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              draftId,
            });
          }

          const draftEntity = Object.values(draft).find(
            (entity) => entity.draftId === draftId
          );

          if (parent.type === state.schema.nodes.entity) {
            const parentDraftId = (tr?.doc ?? state.doc).nodeAt(pos - 1)?.attrs
              .draftId;

            if (parentDraftId) {
              if (!draft[parentDraftId]) {
                throw new Error(
                  "invariant: parent node missing from draft store"
                );
              }

              // @ts-expect-error
              draft[parentDraftId].properties!.entity ??= {};
              // @ts-expect-error
              // @todo need to set componentId here somehow?
              Object.assign(draft[parentDraftId].properties!.entity, {
                draftId,
                entityId: draftEntity?.entityId ?? null,
              });
            }
          }

          if (draftEntity) {
            const child = node.firstChild;

            if (child) {
              const props = nodeToEntityProperties(child);
              if (props && "properties" in draftEntity) {
                // @todo need to be smarter
                if (
                  JSON.stringify(props) !==
                  JSON.stringify(draftEntity.properties)
                ) {
                  if (!tr) {
                    tr = state.tr;
                  }
                  draftEntity.properties = props;
                }
              }
            }
          }
        }
      });
    });

    tr?.setMeta(entityStorePluginKey, { type: "draft", payload: newDraft });

    return tr;
  },
});
