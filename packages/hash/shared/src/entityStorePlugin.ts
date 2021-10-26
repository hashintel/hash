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
    };

export const entityStorePluginKey = new PluginKey<
  EntityStorePluginState,
  Schema
>("entityStore");

export const entityStoreFromProsemirror = (state: EditorState<Schema>) => {
  const pluginState = entityStorePluginKey.getState(state);

  if (!pluginState) {
    throw new Error(
      "Cannot process transaction when state does not have entity store plugin"
    );
  }
  return pluginState;
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
      state.doc.descendants((node, pos) => {
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
