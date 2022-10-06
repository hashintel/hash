import {
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
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
import { isEqual } from "lodash";
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

export type CommentTextFieldRef = {
  resetDocument: () => void;
  focus: () => void;
  getDom: () => Element | undefined;
};

type CommentTextFieldProps = {
  initialText?: TextToken[];
  classNames?: string;
  loading?: boolean;
  editable?: boolean;
  readOnly?: boolean;
  onChange?: (value: TextToken[]) => void;
  onFocusChange?: (focused: boolean) => void;
  onClose?: () => void;
  onSubmit?: () => Promise<void>;
};

export const CommentTextField = forwardRef<
  CommentTextFieldRef,
  CommentTextFieldProps
>(
  (
    {
      initialText,
      classNames = "",
      loading = false,
      editable = false,
      readOnly = false,
      onChange,
      onFocusChange,
      onClose,
      onSubmit,
    },
    ref,
  ) => {
    const viewRef = useRef<EditorView<Schema>>();
    const [portals, renderPortal] = usePortals();
    const { accountId } = useRouteAccountInfo();
    const editorContainerRef = useRef<HTMLDivElement>();
    const editableRef = useRef(false);
    const eventsRef = useRef({ onClose, onSubmit });
    const [prevValue, setPrevValue] = useState(initialText);

    if (onChange && viewRef.current) {
      const { tokens } = textBlockNodeToEntityProperties(
        viewRef.current?.state.doc,
      );

      if (!isEqual(prevValue, tokens)) {
        onChange(tokens);
        setPrevValue(tokens);
      }
    }

    useLayoutEffect(() => {
      eventsRef.current = { onClose, onSubmit };
      editableRef.current = editable;
    });

    const getInitialTokens = useCallback(
      (schema: Schema) =>
        initialText?.length
          ? textBlockNodesFromTokens(initialText, schema)
          : [],
      [initialText],
    );

    const resetDocument = () => {
      const view = viewRef.current;
      if (view) {
        const state = view.state;
        const tr = state.tr.replaceWith(
          0,
          state.doc.content.size,
          getInitialTokens(view.state.schema),
        );
        view.dispatch(tr);
      }
    };

    useImperativeHandle(ref, () => ({
      resetDocument,
      focus: () => viewRef.current?.focus(),
      getDom: () => viewRef.current?.dom,
    }));

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
          doc: schema.node("doc", {}, getInitialTokens(schema)),
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
            commentPlaceholderPlugin(renderPortal, "Leave a comment"),
          ],
        });

        const view = createTextEditorView(
          state,
          editorContainer,
          renderPortal,
          accountId,
          {
            editable: () => editableRef.current,
            attributes: {
              class: styles.Comment__TextField!,
            },
          },
        );

        view.focus();
        viewRef.current = view;

        return () => {
          view.destroy();
          viewRef.current = undefined;
        };
      }
    }, [getInitialTokens, accountId, renderPortal]);

    useEffect(() => {
      viewRef.current?.setProps({ editable: () => editable });

      if (editable) {
        viewRef.current?.focus();
      }
    }, [editable]);

    useEffect(() => {
      viewRef.current?.setProps({
        attributes: { class: `${styles.Comment__TextField!} ${classNames}` },
      });
    }, [classNames]);

    if (viewRef.current) {
      onFocusChange?.(viewRef.current.hasFocus());
    }

    return (
      <Box display="flex" flex={1} overflow="hidden">
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
  },
);
