import { FunctionComponent, useEffect, useRef } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { formatKeymap } from "@hashintel/hash-shared/createProseMirrorState";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { createSchema } from "@hashintel/hash-shared/prosemirror";
import { Box } from "@mui/material";
import { faAt } from "@fortawesome/free-solid-svg-icons";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import { usePortals } from "../usePortals";
import { createFormatPlugins } from "../createFormatPlugins";
import {
  createSuggester,
  suggesterPluginKey,
} from "../createSuggester/createSuggester";
import { useRouteAccountInfo } from "../../../shared/routing";
import { clipboardTextSerializer, mentionNodeView } from "../createEditorView";
import styles from "./style.module.css";

type CommentInputProps = {
  blockId: string;
  onClose: () => void;
};

export const CommentInput: FunctionComponent<CommentInputProps> = ({
  blockId,
  onClose,
}) => {
  const editorRef = useRef<HTMLDivElement>();
  const viewRef = useRef<EditorView<Schema>>();
  const [portals, renderPortal] = usePortals();
  const { accountId } = useRouteAccountInfo();

  useEffect(() => {
    const editorContainer = editorRef.current;
    if (editorContainer) {
      editorContainer.innerHTML = "";
      const textSchema = createSchema();

      const doc = textSchema.node("doc", {}, []);

      const state = EditorState.create<Schema>({
        doc,
        plugins: [
          keymap<Schema>(baseKeymap),
          ...createFormatPlugins(renderPortal),
          formatKeymap(doc),
          createSuggester(renderPortal, accountId, editorContainer),
        ],
      });

      const view = new EditorView<Schema>(editorContainer, {
        state,
        clipboardTextSerializer: clipboardTextSerializer(
          state.schema.nodes.hardBreak,
        ),
        nodeViews: {
          mention: mentionNodeView(renderPortal, accountId),
        },
      });

      view.dom.classList.add(styles.Prosemirror_Input!);

      viewRef.current = view;
    }
  }, [accountId, renderPortal, blockId]);

  return (
    <Box
      sx={({ transitions, palette }) => ({
        width: 250,
        display: "flex",
        borderRadius: 1.5,
        border: "1px solid #DDE7F0",
        backdropFilter: "blur(40px)",
        transition: transitions.create("border-color"),

        "&:focus-within": {
          borderColor: palette.blue[60],
        },
      })}
    >
      <IconButton
        onClick={onClose}
        sx={{
          padding: 0.5,
          borderRadius: 1,
          margin: 1.5,
          transition: ({ transitions }) => transitions.create("opacity"),
          alignSelf: "flex-start",
        }}
      >
        <FontAwesomeIcon icon={faComment} />
      </IconButton>

      <Box
        ref={editorRef}
        sx={{
          overflow: "hidden",
          flexGrow: 1,
          fontSize: 14,
          lineHeight: "150%",
        }}
      />
      <IconButton
        onClick={() => {
          if (viewRef.current) {
            const { tr } = viewRef.current.state;
            tr.setMeta(suggesterPluginKey, { type: "toggle" });
            viewRef.current.dispatch(tr);
            viewRef.current.focus();
          }
        }}
        sx={{
          padding: 0.5,
          borderRadius: 1,
          margin: 1.5,
          alignSelf: "flex-end",
          order: 1,
        }}
      >
        <FontAwesomeIcon icon={faAt} />
      </IconButton>
      {portals}
    </Box>
  );
};
