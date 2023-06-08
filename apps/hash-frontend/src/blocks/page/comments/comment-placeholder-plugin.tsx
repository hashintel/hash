import { Typography } from "@mui/material";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { RenderPortal } from "../block-portals";

export type CommentPlaceholderAction = {
  type: "replacePlaceholder";
  payload: { placeholder: string };
};

interface CommentPlaceholderState {
  placeholder: string;
}

export const commentPlaceholderPluginkey =
  new PluginKey<CommentPlaceholderState>("commentPlaceholder");

// Simplified version of createPlaceholderPlugin to be used in Comments
export const commentPlaceholderPlugin = (renderPortal: RenderPortal) =>
  new Plugin<CommentPlaceholderState>({
    key: commentPlaceholderPluginkey,
    state: {
      init() {
        return {
          placeholder: "",
        };
      },
      apply(tr, state, _prevEditorState) {
        const action: CommentPlaceholderAction | undefined = tr.getMeta(
          commentPlaceholderPluginkey,
        );

        switch (action?.type) {
          case "replacePlaceholder":
            return { ...state, placeholder: action.payload.placeholder };
        }

        return state;
      },
    },
    props: {
      decorations(state) {
        const doc = state.doc;

        if (doc.content.size === 0) {
          const placeholder =
            commentPlaceholderPluginkey.getState(state)?.placeholder;

          const placeholderDecoration = Decoration.widget(
            0,
            () => {
              const mountNode = document.createElement("span");

              renderPortal(
                <Typography
                  component="span"
                  sx={{
                    fontSize: "inherit",
                    color: ({ palette }) => palette.gray[70],
                  }}
                >
                  {placeholder}
                </Typography>,
                mountNode,
              );

              return mountNode;
            },
            /**
             * passing a key prevents a focus related bug, by preventing re-creation of the dom node
             * the placeholder is included inside the key so the node is re-created when it changes
             * */
            {
              key: `comment-placeholder-${placeholder}`,
              destroy: (node) => {
                renderPortal(null, node as HTMLElement);
              },
            },
          );

          return DecorationSet.create(state.doc, [placeholderDecoration]);
        }
      },
    },
  });
