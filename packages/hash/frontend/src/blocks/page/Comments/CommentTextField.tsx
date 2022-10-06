import {
  FunctionComponent,
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
import {
  faAt,
  faChevronDown,
  faChevronUp,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import {
  IconButton,
  FontAwesomeIcon,
  LoadingSpinner,
  Button,
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

const LINE_HEIGHT = 21;

type ShowMoreTextLinkProps = {
  label: string;
  icon: IconDefinition;
  onClick: () => void;
};

export const ShowMoreTextLink: FunctionComponent<ShowMoreTextLinkProps> = ({
  label,
  icon,
  onClick,
}) => (
  <Button
    size="xs"
    variant="tertiary_quiet"
    sx={{
      display: "flex",
      alignItems: "center",
      fontWeight: 600,
      textDecoration: "none",
      cursor: "pointer",
      alignSelf: "flex-end",
      px: 0.5,
      py: 0,
      minHeight: 0,
      color: ({ palette }) => palette.primary.main,
    }}
    onClick={onClick}
  >
    {label}
    <FontAwesomeIcon icon={icon} sx={{ fontSize: 12, ml: 0.75 }} />
  </Button>
);

export type CommentTextFieldRef = {
  resetDocument: () => void;
  focus: () => void;
};

type CommentTextFieldProps = {
  editable?: boolean;
  initialText?: TextToken[];
  collapsible?: boolean;
  classNames?: string;
  loading?: boolean;
  onClose?: () => void;
  onSubmit?: () => Promise<void>;
  onFocusChange?: (focused: boolean) => void;
  setValue: (value: TextToken[]) => void;
};

export const CommentTextField = forwardRef<
  CommentTextFieldRef,
  CommentTextFieldProps
>(
  (
    {
      editable = false,
      initialText,
      collapsible = false,
      classNames = "",
      loading = false,
      onClose,
      onSubmit,
      onFocusChange,
      setValue,
    },
    ref,
  ) => {
    const viewRef = useRef<EditorView<Schema>>();
    const [portals, renderPortal] = usePortals();
    const { accountId } = useRouteAccountInfo();
    const editorContainerRef = useRef<HTMLDivElement>();
    const editableRef = useRef(false);
    const loadingRef = useRef(false);
    const eventsRef = useRef({ onClose, onSubmit });
    const [collapsed, setCollapsed] = useState(true);
    const [shouldCollapse, setShouldCollapse] = useState(false);
    const [prevValue, setPrevValue] = useState(initialText);

    if (setValue && viewRef.current) {
      const { tokens } = textBlockNodeToEntityProperties(
        viewRef.current?.state.doc,
      );

      if (!isEqual(prevValue, tokens)) {
        setValue(tokens);
        setPrevValue(tokens);
      }
    }

    useLayoutEffect(() => {
      eventsRef.current = { onClose, onSubmit };
      loadingRef.current = loading;
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

        setShouldCollapse(
          collapsible && view.dom.clientHeight >= LINE_HEIGHT * 2,
        );

        view.focus();
        viewRef.current = view;

        return () => {
          view.destroy();
          viewRef.current = undefined;
        };
      }
    }, [getInitialTokens, collapsible, accountId, renderPortal, setValue]);

    useEffect(() => {
      if (shouldCollapse) {
        if (collapsed) {
          viewRef.current?.dom.classList.add(
            styles.Comment__TextField_collapsed!,
          );
        } else {
          viewRef.current?.dom.classList.remove(
            styles.Comment__TextField_collapsed!,
          );
        }
      }
    }, [collapsed, shouldCollapse]);

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
      <Box
        display="flex"
        flexDirection="column"
        justifyItems="flex-end"
        flex={1}
        overflow="hidden"
      >
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

        {shouldCollapse ? (
          collapsed ? (
            <ShowMoreTextLink
              label="Show More"
              icon={faChevronDown}
              onClick={() => setCollapsed(false)}
            />
          ) : (
            <ShowMoreTextLink
              label="Show Less"
              icon={faChevronUp}
              onClick={() => setCollapsed(true)}
            />
          )
        ) : null}
      </Box>
    );
  },
);
