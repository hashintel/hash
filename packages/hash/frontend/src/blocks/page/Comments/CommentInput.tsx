import { FunctionComponent, useEffect, useRef } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { formatKeymap } from "@hashintel/hash-shared/createProseMirrorState";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { createSchema } from "@hashintel/hash-shared/prosemirror";
import { Box } from "@mui/material";
import { usePortals } from "../usePortals";
import { createFormatPlugins } from "../createFormatPlugins";
import { createSuggester } from "../createSuggester/createSuggester";
import { useRouteAccountInfo } from "../../../shared/routing";
import { clipboardTextSerializer, mentionNodeView } from "../createEditorView";

type CommentInputProps = {};

export const CommentInput: FunctionComponent<CommentInputProps> = () => {
  const editorRef = useRef<HTMLDivElement>();
  const viewRef = useRef<EditorView<Schema>>();
  const [portals, renderPortal] = usePortals();
  const { accountId } = useRouteAccountInfo();

  useEffect(() => {
    if (editorRef.current) {
      const textSchema = createSchema();

      const doc = textSchema.node("doc", {}, []);

      const state = EditorState.create<Schema>({
        doc,
        plugins: [
          keymap<Schema>(baseKeymap),
          ...createFormatPlugins(renderPortal),
          formatKeymap(doc),
          createSuggester(renderPortal, accountId, editorRef.current),
        ],
      });

      const view = new EditorView<Schema>(editorRef.current, {
        state,
        clipboardTextSerializer: clipboardTextSerializer(
          state.schema.nodes.hardBreak,
        ),
        nodeViews: {
          mention: mentionNodeView(renderPortal, accountId),
        },
      });

      viewRef.current = view;
    }
  }, [accountId, renderPortal]);

  return (
    <Box
      ref={editorRef}
      style={{ height: 100 }}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
    >
      {JSON.stringify(viewRef.current?.state.doc.content)}
      {portals}
    </Box>
  );
};
