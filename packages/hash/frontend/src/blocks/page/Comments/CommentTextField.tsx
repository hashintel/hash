import {
  FunctionComponent,
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import {
  createSchema,
  formatKeymap,
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
import { commentPlaceholderPlugin } from "./commentPlaceholderPlugin";
import { createTextEditorView } from "../createTextEditorView";

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
  const editorContainerRef = useRef<HTMLDivElement>();
  const [loading, setLoading] = useState(false);
  const eventsRef = useRef({ onClose, onSubmit });

  useLayoutEffect(() => {
    eventsRef.current = { onClose, onSubmit };
  });

  useEffect(() => {
    const editorContainer = editorContainerRef.current;

    if (editorContainer) {
      const schema = createSchema({
        doc: {
          content: "inline*",
        },
        ...textTokenNodes,
      });

      const state = EditorState.create<Schema>({
        schema,
        plugins: [
          keymap<Schema>({
            Enter(_, __, view) {
              if (!loading && view?.state.doc.content) {
                const { tokens } = textBlockNodeToEntityProperties(
                  view.state.doc,
                );

                if (!tokens.length) return true;

                setLoading(true);
                eventsRef.current
                  .onSubmit(tokens)
                  .then(() => {
                    eventsRef.current.onClose();
                  })
                  .finally(() => {
                    setLoading(false);
                  });
                return true;
              }
              return false;
            },
            Escape() {
              if (!loading) {
                eventsRef.current.onClose();
                return true;
              }
              return false;
            },
          }),
          keymap<Schema>(baseKeymap),
          ...createFormatPlugins(renderPortal),
          formatKeymap(schema),
          createSuggester(renderPortal, accountId, editorContainer),
          commentPlaceholderPlugin(renderPortal, "Leave a comment"),
        ],
      });

      const view = createTextEditorView(
        state,
        editorContainer,
        renderPortal,
        accountId,
      );

      view.dom.classList.add(styles.Comment__TextField_Prosemirror_Input!);
      view.focus();
      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = undefined;
      };
    }
  }, [accountId, renderPortal, loading]);

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

      <Box display="flex" alignItems="flex-end" margin={1.5}>
        {loading ? (
          <Box m={0.75}>
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
