import {
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { formatKeymap } from "@hashintel/hash-shared/createProseMirrorState";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import {
  createSchema,
  textTokenNodes,
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
import { textBlockNodeToEntityProperties } from "@hashintel/hash-shared/text";
import { usePortals } from "../usePortals";
import { createFormatPlugins } from "../createFormatPlugins";
import {
  createSuggester,
  suggesterPluginKey,
} from "../createSuggester/createSuggester";
import { useRouteAccountInfo } from "../../../shared/routing";
import styles from "../style.module.css";
import { placeholderPlugin } from "./placeholderPlugin";
import { createTextEditorView } from "../createEditorView";

type CommentTextFieldProps = {
  onClose: () => void;
  onSubmit: (content: TextToken[]) => Promise<void>;
};

export const CommentTextField: FunctionComponent<CommentTextFieldProps> = ({
  onClose,
  onSubmit,
}) => {
  const viewRef = useRef<EditorView<Schema>>();
  const [portals, renderPortal] = usePortals();
  const { accountId } = useRouteAccountInfo();
  const [loading, setLoading] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>();

  const updateEditorHandleKeyDown = useCallback(
    (container: EditorView<Schema>, preventActions: boolean) => {
      container.update({
        state: container.state,
        handleKeyDown: (view, { shiftKey, key }) => {
          if (!preventActions && !shiftKey) {
            switch (key) {
              case "Enter":
                if (view.state.doc.content) {
                  const { tokens } = textBlockNodeToEntityProperties(
                    view.state.doc,
                  );

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

              case "Escape":
                onClose();
                break;

              default:
                break;
            }
          }

          return false;
        },
      });
    },
    [onClose, onSubmit],
  );

  const createEditor = useCallback(
    (container: HTMLDivElement) => {
      container.setAttribute("innerHTML", "");

      const schema = createSchema({
        doc: {
          content: "inline*",
        },
        ...textTokenNodes,
      });

      const state = EditorState.create<Schema>({
        schema,
        plugins: [
          keymap<Schema>(baseKeymap),
          ...createFormatPlugins(renderPortal),
          formatKeymap(schema),
          createSuggester(renderPortal, accountId, container),
          placeholderPlugin(renderPortal, "Leave a comment"),
        ],
      });

      const view = createTextEditorView(
        state,
        container,
        renderPortal,
        accountId,
      );

      view.dom.classList.add(styles.Comment__TextField_Prosemirror_Input!);

      updateEditorHandleKeyDown(view, false);
      view.focus();

      viewRef.current = view;
    },
    [accountId, renderPortal, updateEditorHandleKeyDown],
  );

  useEffect(() => {
    if (viewRef.current) {
      updateEditorHandleKeyDown(viewRef.current, loading);
    }
  }, [updateEditorHandleKeyDown, loading]);

  useEffect(() => {
    const editorContainer = editorContainerRef.current;
    if (editorContainer) {
      createEditor(editorContainer);
    }
  }, [editorContainerRef, createEditor]);

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
        ref={editorContainerRef}
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
