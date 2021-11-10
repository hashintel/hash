import { toggleMark } from "prosemirror-commands";
import { inputRules } from "prosemirror-inputrules";
import { Mark, Schema } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import React from "react";
import { tw } from "twind";
import { RenderPortal } from "../../blocks/page/usePortals";
import { ensureMounted } from "../../lib/dom";
import { MarksTooltip } from "./MarksTooltip";
import { LinkModal } from "./LinkModal";
import {
  getActiveMarksWithAttrs,
  updateLink,
  selectionContainsText,
  isValidLink,
  linkInputRule,
} from "./util";

interface MarksTooltipState {
  focused: boolean;
}

interface LinkPluginState {
  linkModalVisible: boolean | undefined;
}

const key = new PluginKey<MarksTooltipState, Schema>("markstooltip");

const linkPluginKey = new PluginKey<LinkPluginState, Schema>("linkPlugin");

const tooltipRef = React.createRef<HTMLDivElement>();
const linkModalRef = React.createRef<HTMLDivElement>();

export function createFormatPlugins(renderPortal: RenderPortal) {
  let timeout: NodeJS.Timeout;
  const marksTooltip = new Plugin<MarksTooltipState, Schema>({
    key,
    /**
     * This allows us to keep track of whether the view is focused, which
     * is important for knowing whether to show the format tooltip
     */
    state: {
      init() {
        return { focused: false };
      },
      apply(tr, state) {
        const action = tr.getMeta(key);

        switch (action?.type) {
          case "format-blur":
            return { focused: false };
          case "format-focus":
            return { focused: true };
          default:
            return state;
        }
      },
    },

    props: {
      handleDOMEvents: {
        blur(view) {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            // if link modal is visible, don't close
            if (linkModalRef.current?.contains(document.activeElement)) {
              return false;
            }

            view.dispatch(view.state.tr.setMeta(key, { type: "format-blur" }));
          }, 300);
          return false;
        },
        focus(view) {
          clearTimeout(timeout);
          view.dispatch(view.state.tr.setMeta(key, { type: "format-focus" }));
          return false;
        },
      },
    },

    view(editorView: EditorView<Schema>) {
      const mountNode = document.createElement("div");

      return {
        destroy() {
          renderPortal(null, mountNode);
          mountNode.remove();
        },
        update: (view: EditorView<Schema>, lastState?: EditorState<Schema>) => {
          const dragging = !!editorView.dragging;

          const state = view.state;

          /**
           * We don't always want to display a format tooltip – i.e, when
           * the view isn't focused, when we're dragging and dropping, if
           * you're got an entire node selection, or the text selected is
           * not within a paragraph
           *
           * @todo enable the format tooltip outside of a paragraph node
           */
          if (
            !key.getState(view.state)?.focused ||
            dragging ||
            state.selection instanceof NodeSelection ||
            !selectionContainsText(state) ||
            state.selection.empty
          ) {
            renderPortal(null, mountNode);
            return;
          }

          if (
            !dragging &&
            lastState &&
            lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)
          ) {
            return;
          }

          const { from, to } = state.selection;
          const start = view.coordsAtPos(from);
          const end = view.coordsAtPos(to);

          const top = start.top + document.documentElement.scrollTop;
          const left =
            start.left +
            (end.right - start.left) / 2 +
            document.documentElement.scrollLeft;

          const activeMarks = getActiveMarksWithAttrs(editorView);

          const jsx = (
            <div
              className={tw`absolute z-30`}
              style={{ top, left }}
              ref={tooltipRef}
            >
              <MarksTooltip
                activeMarks={activeMarks}
                toggleMark={(name, attrs) => {
                  toggleMark(editorView.state.schema.marks[name], attrs)(
                    editorView.state,
                    editorView.dispatch,
                  );
                }}
                focusEditorView={() => editorView.focus()}
                openLinkModal={() =>
                  editorView.dispatch(
                    editorView.state.tr.setMeta(linkPluginKey, {
                      type: "openLinkModal",
                    }),
                  )
                }
              />
            </div>
          );

          ensureMounted(mountNode, document.body);
          renderPortal(jsx, mountNode);
        },
      };
    },
  });

  const linkPlugin = new Plugin<LinkPluginState, Schema>({
    key: linkPluginKey,
    state: {
      init() {
        /** Should use a better name, since this only gets changed when user clicks on link button in tooltip */
        return { linkModalVisible: undefined };
      },
      apply(tr, state) {
        const action = tr.getMeta(linkPluginKey);

        switch (action?.type) {
          case "closeLinkModal":
            return { linkModalVisible: false };
          case "openLinkModal":
            return { linkModalVisible: true };
          default:
            return state;
        }
      },
    },

    props: {
      handleDOMEvents: {
        paste(view, evt) {
          if (!evt.clipboardData) {
            return false;
          }

          const text = evt.clipboardData.getData("text/plain");
          const html = evt.clipboardData.getData("text/html");
          const isPlainText = Boolean(text) && !html;

          if (isPlainText && isValidLink(text)) {
            evt.preventDefault();
            updateLink(view, text);
          }

          return false;
        },
      },
    },

    view(editorView: EditorView<Schema>) {
      const mountNode = document.createElement("div");

      return {
        destroy() {
          renderPortal(null, mountNode);
          mountNode.remove();
        },
        update: (view: EditorView<Schema>) => {
          ensureMounted(mountNode, document.body);
          const state = view.state;

          /**
           * Fix flow
           * 1. Link modal persisting
           *    - open link modal from mark tooltip,
           *    - put the cursor on a different text without a link mark.
           *    - link modal persists instead of going off
           * 2. When the modal comes up as a result of the cursor being within a link, remove link doesn't work
           */

          if (
            !key.getState(editorView.state)?.focused ||
            state.selection instanceof NodeSelection
          ) {
            renderPortal(null, mountNode);
            return;
          }

          let linkUrl;
          const linkMark = state.schema.marks.link;

          // If cursor is within link
          if (
            state.selection.empty &&
            linkMark.isInSet(state.selection.$from.marks())
          ) {
            linkUrl = state.selection.$from
              .marks()
              ?.find((mark: Mark) => mark.type.name === "link")?.attrs.href;
          }
          // If link is in text selection
          else if (
            state.doc.rangeHasMark(
              state.selection.$from.pos,
              state.selection.$to.pos,
              linkMark,
            )
          ) {
            linkUrl = getActiveMarksWithAttrs(editorView).find(
              ({ name }) => name === "link",
            )?.attrs?.href;
          }

          if (linkUrl || linkPluginKey.getState(view.state)?.linkModalVisible) {
            const { from, to } = state.selection;
            const start = view.coordsAtPos(from);
            const end = view.coordsAtPos(to);

            const left =
              start.left +
              (end.right - start.left) / 2 +
              document.documentElement.scrollLeft;
            const bottom = end.bottom + document.documentElement.scrollTop;

            renderPortal(
              <div
                style={{ left, top: bottom }}
                className={tw`absolute z-50`}
                ref={linkModalRef}
              >
                <LinkModal
                  defaultLinkMarkHref={linkUrl}
                  updateLink={(href) => {
                    updateLink(editorView, href);
                    editorView.dispatch(
                      editorView.state.tr.setMeta(linkPluginKey, {
                        type: "closeLinkModal",
                      }),
                    );
                  }}
                  removeLink={() => {
                    toggleMark(editorView.state.schema.marks.link)(
                      editorView.state,
                      editorView.dispatch,
                    );
                    editorView.dispatch(
                      editorView.state.tr.setMeta(linkPluginKey, {
                        type: "closeLinkModal",
                      }),
                    );
                  }}
                />
              </div>,
              mountNode,
            );
          } else {
            renderPortal(null, mountNode);
          }
        },
      };
    },
  });

  return [
    marksTooltip,
    linkPlugin,
    inputRules({
      rules: [linkInputRule()],
    }),
  ] as Plugin<unknown, Schema>[];
}
