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
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import {
  textBlockNodeToEntityProperties,
  textBlockNodesFromTokens,
} from "@hashintel/hash-shared/text";
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
  editable?: boolean;
  initialText?: TextToken[];
  expanded?: boolean;
  onClose?: () => void;
  onSubmit?: (content: TextToken[]) => Promise<void>;
};

export const CommentTextField: FunctionComponent<CommentTextFieldProps> = ({
  editable = false,
  initialText,
  expanded = true,
  onClose,
  onSubmit,
}) => {
  const viewRef = useRef<EditorView<Schema>>();
  const [portals, renderPortal] = usePortals();
  const { accountId } = useRouteAccountInfo();
  const editorContainerRef = useRef<HTMLDivElement>();
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const eventsRef = useRef({ onClose, onSubmit });

  useLayoutEffect(() => {
    eventsRef.current = { onClose, onSubmit };
    loadingRef.current = loading;
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
        doc: schema.node(
          "doc",
          {},
          initialText?.length
            ? textBlockNodesFromTokens(initialText, schema)
            : [],
        ),
        schema,
        plugins: editable
          ? [
              keymap<Schema>({
                Enter(_, __, view) {
                  if (
                    eventsRef.current.onSubmit &&
                    !loadingRef.current &&
                    view?.state.doc.content
                  ) {
                    const { tokens } = textBlockNodeToEntityProperties(
                      view.state.doc,
                    );

                    if (!tokens.length) return true;

                    setLoading(true);
                    eventsRef.current
                      .onSubmit(tokens)
                      .then(() => {
                        eventsRef.current.onClose?.();
                      })
                      .finally(() => {
                        setLoading(false);
                      });
                    return true;
                  }
                  return false;
                },
                Escape() {
                  if (eventsRef.current.onClose && !loadingRef.current) {
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
            ]
          : [],
      });

      const view = createTextEditorView(
        state,
        editorContainer,
        renderPortal,
        accountId,
        { editable: () => editable },
      );

      view.dom.classList.add(styles.Comment__TextField_Prosemirror_Input!);

      view.focus();
      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = undefined;
      };
    }
  }, [initialText, editable, accountId, renderPortal]);

  useEffect(() => {
    if (expanded) {
      viewRef.current?.dom.classList.remove(
        styles.Comment__TextField_Prosemirror_Input_collapsed!,
      );
    } else {
      viewRef.current?.dom.classList.add(
        styles.Comment__TextField_Prosemirror_Input_collapsed!,
      );
    }
  }, [expanded]);

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
      }}
    >
      <Box
        ref={editorContainerRef}
        sx={({ palette }) => ({
          display: "flex",
          overflow: "hidden",
          flexGrow: 1,
          fontSize: 14,
          lineHeight: "150%",
          color: palette.gray[90],
        })}
      />

      {editable ? (
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
      ) : null}

      {portals}
    </Box>
  );
};
