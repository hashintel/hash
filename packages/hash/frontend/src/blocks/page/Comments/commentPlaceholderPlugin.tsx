import Typography from "@mui/material/Typography";
import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { RenderPortal } from "../usePortals";

// Simplified version of createPlaceholderPlugin to be used in Comments
export const commentPlaceholderPlugin = (
  renderPortal: RenderPortal,
  text: string,
) =>
  new Plugin<Schema, Schema>({
    props: {
      decorations(state) {
        const doc = state.doc;

        if (doc.content.size === 0) {
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
                  {text}
                </Typography>,
                mountNode,
              );

              return mountNode;
            },
            {
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
