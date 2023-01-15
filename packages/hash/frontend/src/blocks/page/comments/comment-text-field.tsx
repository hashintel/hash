import { faAt } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  LoadingSpinner,
} from "@local/hash-design-system";
import { TextToken } from "@local/hash-isomorphic-utils/graphql/types";
import {
  createSchema,
  formatKeymap,
  textTokenNodes,
} from "@local/hash-isomorphic-utils/prosemirror";
import {
  textBlockNodesFromTokens,
  textBlockNodeToTextTokens,
} from "@local/hash-isomorphic-utils/text";
import { Box } from "@mui/material";
import { debounce, isEqual } from "lodash";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  FunctionComponent,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { WorkspaceContext } from "../../../pages/shared/workspace-context";
import { usePortals } from "../block-portals";
import { createFormatPlugins } from "../create-format-plugins";
import {
  createSuggester,
  suggesterPluginKey,
} from "../create-suggester/create-suggester";
import { createTextEditorView } from "../create-text-editor-view";
import {
  CommentPlaceholderAction,
  commentPlaceholderPlugin,
  commentPlaceholderPluginkey,
} from "./comment-placeholder-plugin";
import styles from "./style.module.css";

type CommentTextFieldProps = {
  value?: TextToken[];
  placeholder?: string;
  className?: string;
  loading?: boolean;
  editable?: boolean;
  readOnly?: boolean;
  onChange?: (value: TextToken[]) => void;
  onLineCountChange?: (lines: number) => void;
  onFocusChange?: (focused: boolean) => void;
  onClose?: () => void;
  onSubmit?: () => Promise<void>;
};

const LINE_HEIGHT = 21;

export const CommentTextField: FunctionComponent<CommentTextFieldProps> = ({
  value,
  placeholder = "Leave a comment",
  className = "",
  loading = false,
  editable = false,
  readOnly = false,
  onChange,
  onLineCountChange,
  onFocusChange,
  onClose,
  onSubmit,
}) => {
  const viewRef = useRef<EditorView>();
  const [portals, renderPortal] = usePortals();
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);
  const editorContainerRef = useRef<HTMLDivElement>();
  const editableRef = useRef(false);
  const eventsRef = useRef({ onClose, onSubmit, onLineCountChange });

  useLayoutEffect(() => {
    eventsRef.current = { onClose, onSubmit, onLineCountChange };
    editableRef.current = editable;
  });

  const setDocument = (tokens: TextToken[]) => {
    const view = viewRef.current;
    if (view) {
      const state = view.state;
      const tr = state.tr.replaceWith(
        0,
        state.doc.content.size,
        tokens.length ? textBlockNodesFromTokens(tokens, state.schema) : [],
      );
      view.dispatch(tr);
    }
  };

  useEffect(() => {
    const editorContainer = editorContainerRef.current;

    if (editorContainer && activeWorkspaceAccountId) {
      const schema = createSchema({
        doc: {
          content: "inline*",
        },
        ...textTokenNodes,
      });

      const state = EditorState.create({
        schema,
        plugins: [
          keymap({
            Enter() {
              if (eventsRef.current.onSubmit) {
                void eventsRef.current.onSubmit();
                return true;
              }

              return false;
            },
            Escape() {
              if (eventsRef.current.onClose) {
                eventsRef.current.onClose();
                return true;
              }
              return false;
            },
          }),
          keymap(baseKeymap),
          ...createFormatPlugins(renderPortal),
          formatKeymap(schema),
          createSuggester(
            renderPortal,
            activeWorkspaceAccountId,
            editorContainer,
          ),
          commentPlaceholderPlugin(renderPortal),
        ],
      });

      const view = createTextEditorView(
        state,
        editorContainer,
        renderPortal,
        activeWorkspaceAccountId,
        {
          dispatchTransaction: (tr) => {
            const newState = view.state.apply(tr);

            if (onChange) {
              const tokens = textBlockNodeToTextTokens(newState.doc);

              onChange(tokens);
            }

            view.updateState(newState);
          },
          editable: () => editableRef.current,
          attributes: {
            class: styles.Comment__TextField!,
          },
        },
      );

      view.focus();
      viewRef.current = view;

      const debouncedResizeCallback = debounce(
        () =>
          eventsRef.current.onLineCountChange?.(
            Math.floor((viewRef.current?.dom.scrollHeight ?? 0) / LINE_HEIGHT),
          ),
        10,
      );

      const resizeObserver = new ResizeObserver(() => {
        debouncedResizeCallback();
      });

      resizeObserver.observe(view.dom);

      return () => {
        resizeObserver.unobserve(view.dom);
        view.destroy();
        viewRef.current = undefined;
      };
    }
  }, [onChange, activeWorkspaceAccountId, renderPortal]);

  useEffect(() => {
    viewRef.current?.setProps({ editable: () => editable });

    if (editable) {
      viewRef.current?.focus();
    }
  }, [editable]);

  useEffect(() => {
    viewRef.current?.setProps({
      attributes: { class: `${styles.Comment__TextField!} ${className}` },
    });
  }, [className]);

  useEffect(() => {
    if (value && viewRef.current) {
      const tokens = textBlockNodeToTextTokens(viewRef.current.state.doc);

      if (!isEqual(value, tokens)) {
        setDocument(value);
      }
    }
  }, [onChange, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      const tr = view.state.tr.setMeta(commentPlaceholderPluginkey, {
        type: "replacePlaceholder",
        payload: { placeholder },
      } as CommentPlaceholderAction);
      view.dispatch(tr);
    }
  }, [placeholder]);

  return (
    <Box
      display="flex"
      flex={1}
      overflow="hidden"
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
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

      {!readOnly ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            mx: 1,
            my: 1.375,
          }}
        >
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
