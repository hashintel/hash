import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { Popper } from "@mui/material";
import { Schema } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { ensureMounted } from "../../lib/dom";
import { CommentTextField } from "./Comments/CommentTextField";
import { RenderPortal } from "./usePortals";

export type CreateCommentAction =
  | {
      type: "open";
      payload: {
        anchorNode: HTMLElement;
        blockId: string;
        onSubmit: (content: TextToken[]) => Promise<void>;
      };
    }
  | { type: "close" };

interface CreateCommentState {
  open: boolean;
  anchorNode: HTMLElement | null;
  blockId: string | null;
  onSubmit: ((content: TextToken[]) => Promise<void>) | null;
}

export const createCommentPluginKey = new PluginKey<CreateCommentState, Schema>(
  "createComment",
);

export const createCommentPlugin = (
  renderPortal: RenderPortal,
  documentRoot: HTMLElement,
) =>
  new Plugin<CreateCommentState, Schema>({
    key: createCommentPluginKey,
    state: {
      init() {
        return {
          open: false,
          anchorNode: null,
          blockId: null,
          onSubmit: null,
        };
      },
      /** produces a new state from the old state and incoming transactions (cf. reducer) */
      apply(tr, state, _prevEditorState) {
        const action: CreateCommentAction | undefined = tr.getMeta(
          createCommentPluginKey,
        );

        switch (action?.type) {
          case "open":
            return {
              ...state,
              open: true,
              ...action.payload,
            };

          case "close":
            return { ...state, open: false };
        }

        return state;
      },
    },
    props: {
      handleDOMEvents: {
        keydown(view, event) {
          if (event.key === "Escape") {
            const { tr } = view.state;
            tr.setMeta(createCommentPluginKey, { type: "close" });
          }

          return false;
        },
      },
    },
    view() {
      const mountNode = document.createElement("div");

      return {
        update(view) {
          const { open, blockId, anchorNode, onSubmit } =
            createCommentPluginKey.getState(view.state)!;

          if (!open || !blockId || !anchorNode) return this.destroy!();

          const onClose = () => {
            const { tr } = view.state;
            tr.setMeta(createCommentPluginKey, {
              type: "close",
            });
            view.dispatch(tr);
          };

          ensureMounted(mountNode, documentRoot);
          renderPortal(
            <Popper
              open
              placement="bottom-start"
              container={documentRoot}
              modifiers={[
                {
                  name: "offset",
                  options: {
                    offset: () => [
                      -13,
                      -anchorNode.getBoundingClientRect().height - 13,
                    ],
                  },
                },
                {
                  name: "preventOverflow",
                  enabled: true,
                  options: {
                    padding: 20,
                  },
                },
              ]}
              anchorEl={anchorNode}
            >
              <CommentTextField
                blockId={blockId}
                onClose={onClose}
                onSubmit={onSubmit}
              />
            </Popper>,
            mountNode,
          );
        },
        destroy() {
          renderPortal(null, mountNode);
          mountNode.remove();
        },
      };
    },
  }) as Plugin<unknown, Schema>;
