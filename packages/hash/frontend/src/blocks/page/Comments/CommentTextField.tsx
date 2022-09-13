import { FunctionComponent, useEffect, useRef, useState } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { formatKeymap } from "@hashintel/hash-shared/createProseMirrorState";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import {
  createSchema,
  hardBreakNode,
  mentionNode,
  textNode,
} from "@hashintel/hash-shared/prosemirror";
import { Box } from "@mui/material";
import { faAt } from "@fortawesome/free-solid-svg-icons";
import {
  IconButton,
  FontAwesomeIcon,
  LoadingSpinner,
} from "@hashintel/hash-design-system";
import { faComment } from "@fortawesome/free-regular-svg-icons";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { usePortals } from "../usePortals";
import { createFormatPlugins } from "../createFormatPlugins";
import {
  createSuggester,
  suggesterPluginKey,
} from "../createSuggester/createSuggester";
import { useRouteAccountInfo } from "../../../shared/routing";
import { clipboardTextSerializer, mentionNodeView } from "../createEditorView";
import styles from "./style.module.css";
import { placeholderPlugin } from "./placeholderPlugin";

type CommentTextFieldProps = {
  blockId: string;
  onClose: () => void;
  onSubmit: ((content: TextToken[]) => Promise<void>) | null;
};

export const CommentTextField: FunctionComponent<CommentTextFieldProps> = ({
  blockId,
  onClose,
  onSubmit,
}) => {
  const editorRef = useRef<HTMLDivElement>();
  const viewRef = useRef<EditorView<Schema>>();
  const [portals, renderPortal] = usePortals();
  const { accountId } = useRouteAccountInfo();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const editorContainer = editorRef.current;
    if (editorContainer) {
      editorContainer.innerHTML = "";
      const textSchema = createSchema({
        doc: {
          content: "inline*",
        },
        text: textNode,
        hardBreak: hardBreakNode,
        mention: mentionNode,
      });

      const doc = textSchema.node("doc", {}, []);

      const state = EditorState.create<Schema>({
        doc,
        plugins: [
          keymap<Schema>(baseKeymap),
          ...createFormatPlugins(renderPortal),
          formatKeymap(doc),
          createSuggester(renderPortal, accountId, editorContainer),
          placeholderPlugin(renderPortal, "Leave a comment"),
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
        handleKeyDown: (_, { shiftKey, key }) => {
          if (!shiftKey && key === "Enter") {
            if (onSubmit && viewRef.current?.state.doc.content) {
              const tokens =
                viewRef.current.state.doc.content.toJSON() as TextToken[];

              setLoading(true);
              onSubmit(tokens)
                .then(() => {
                  onClose();
                })
                .finally(() => {
                  setLoading(false);
                });
            }

            return true;
          }

          return false;
        },
      });

      view.dom.classList.add(styles.Prosemirror_Input!);

      view.focus();

      viewRef.current = view;
    }
  }, [accountId, renderPortal, blockId, onSubmit, onClose]);

  return (
    <Box
      sx={({ transitions, palette }) => ({
        width: 250,
        display: "flex",
        borderRadius: 1.5,
        border: `1px solid ${palette.gray[30]}`,
        backdropFilter: "blur(40px)",
        transition: transitions.create("border-color"),
        "&:focus-within": {
          borderColor: palette.blue[60],
        },
      })}
    >
      <IconButton
        onClick={onClose}
        sx={({ palette }) => ({
          padding: 0.5,
          borderRadius: 1,
          margin: 1.5,
          alignSelf: "flex-start",
          color: palette.gray[50],
        })}
      >
        <FontAwesomeIcon icon={faComment} />
      </IconButton>

      <Box
        ref={editorRef}
        sx={({ palette }) => ({
          overflow: "hidden",
          flexGrow: 1,
          fontSize: 14,
          lineHeight: "150%",
          color: palette.gray[90],
        })}
      />

      <Box sx={{ display: "flex", alignItems: "flex-end", margin: 1.5 }}>
        {loading ? (
          <Box sx={{ margin: 0.75 }}>
            <LoadingSpinner size={12} thickness={2} />
          </Box>
        ) : (
          <IconButton
            onClick={() => {
              if (viewRef.current) {
                const { tr } = viewRef.current.state;
                tr.setMeta(suggesterPluginKey, { type: "toggle" });
                viewRef.current.dispatch(tr);
                viewRef.current.focus();
              }
            }}
            sx={({ palette }) => ({
              padding: 0.5,
              borderRadius: 1,
              color: palette.gray[40],
            })}
          >
            <FontAwesomeIcon icon={faAt} />
          </IconButton>
        )}
      </Box>

      {portals}
    </Box>
  );
};
