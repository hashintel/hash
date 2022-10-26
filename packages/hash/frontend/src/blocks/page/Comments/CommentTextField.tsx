import { useEffect, useRef, useLayoutEffect, FunctionComponent } from "react";
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
  textBlockNodeToTextTokens,
  textBlockNodesFromTokens,
} from "@hashintel/hash-shared/text";
import { isEqual } from "lodash";
import { usePortals } from "../usePortals";
import { createFormatPlugins } from "../createFormatPlugins";
import {
  createSuggester,
  suggesterPluginKey,
} from "../createSuggester/createSuggester";
import { useRouteAccountInfo } from "../../../shared/routing";
import styles from "./style.module.css";
import {
  CommentPlaceholderAction,
  commentPlaceholderPlugin,
  commentPlaceholderPluginkey,
} from "./commentPlaceholderPlugin";
import { createTextEditorView } from "../createTextEditorView";

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
  const viewRef = useRef<EditorView<Schema>>();
  const [portals, renderPortal] = usePortals();
  const { accountId } = useRouteAccountInfo();
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
          keymap<Schema>(baseKeymap),
          ...createFormatPlugins(renderPortal),
          formatKeymap(schema),
          createSuggester(renderPortal, accountId, editorContainer),
          commentPlaceholderPlugin(renderPortal),
        ],
      });

      const view = createTextEditorView(
        state,
        editorContainer,
        renderPortal,
        accountId,
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

      const resizeObserver = new ResizeObserver(() => {
        if (viewRef.current) {
          eventsRef.current.onLineCountChange?.(
            Math.floor(viewRef.current.dom.scrollHeight / LINE_HEIGHT),
          );
        }
      });

      resizeObserver.observe(view.dom);

      return () => {
        resizeObserver.unobserve(view.dom);
        view.destroy();
        viewRef.current = undefined;
      };
    }
  }, [onChange, accountId, renderPortal]);

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
