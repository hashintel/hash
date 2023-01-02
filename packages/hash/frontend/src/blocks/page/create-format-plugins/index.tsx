/* eslint-disable canonical/filename-no-index -- @todo rename file */

import { toggleMark } from "prosemirror-commands";
import { inputRules } from "prosemirror-inputrules";
import { Mark } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createRef } from "react";

import { ensureMounted } from "../../../lib/dom";
import { RenderPortal } from "../block-portals";
import { LinkModal } from "./link-modal";
import { MarksTooltip } from "./marks-tooltip";
import {
  getActiveMarksWithAttrs,
  isValidLink,
  linkInputRule,
  removeLink,
  selectionContainsText,
  updateLink,
} from "./util";

interface MarksTooltipState {
  focused: boolean;
}

interface LinkPluginState {
  linkModalVisible: boolean;
  linkUrl: null | string;
}

const markPluginKey = new PluginKey<MarksTooltipState>("markPlugin");
const linkPluginKey = new PluginKey<LinkPluginState>("linkPlugin");

export function createFormatPlugins(renderPortal: RenderPortal) {
  let timeout: NodeJS.Timeout;

  const linkModalRef = createRef<HTMLDivElement>();

  const marksTooltip = new Plugin<MarksTooltipState>({
    key: markPluginKey,
    /**
     * This allows us to keep track of whether the view is focused, which
     * is important for knowing whether to show the format tooltip
     */
    state: {
      init() {
        return { focused: false };
      },
      apply(tr, state) {
        const action = tr.getMeta(markPluginKey);

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

            view.dispatch(
              view.state.tr.setMeta(markPluginKey, { type: "format-blur" }),
            );
          }, 300);
          return false;
        },
        focus(view) {
          clearTimeout(timeout);
          view.dispatch(
            view.state.tr.setMeta(markPluginKey, { type: "format-focus" }),
          );
          return false;
        },
      },
    },

    view(editorView: EditorView) {
      const mountNode = document.createElement("div");

      return {
        destroy() {
          clearTimeout(timeout);
          renderPortal(null, mountNode);
          mountNode.remove();
        },
        update: (view: EditorView, lastState?: EditorState) => {
          const dragging = !!editorView.dragging;

          const state = view.state;

          /**
           * Hide tooltip if in read-only mode
           */
          if (!view.editable) {
            return;
          }

          /**
           * We don't always want to display a format tooltip – i.e, when
           * the view isn't focused, when we're dragging and dropping, if
           * you're got an entire node selection, or the text selected is
           * not within a paragraph
           *
           */
          if (
            !markPluginKey.getState(view.state)?.focused ||
            dragging ||
            state.selection instanceof NodeSelection ||
            !selectionContainsText(state) ||
            state.selection.empty
          ) {
            renderPortal(null, mountNode);
            return;
          }

          if (
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
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

          const activeMarks = getActiveMarksWithAttrs(editorView.state);

          const jsx = (
            <div style={{ top, left, position: "absolute", zIndex: "30" }}>
              <MarksTooltip
                activeMarks={activeMarks}
                toggleMark={(name, attrs) => {
                  toggleMark(editorView.state.schema.marks[name]!, attrs)(
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

  const linkPlugin = new Plugin<LinkPluginState>({
    key: linkPluginKey,
    state: {
      init() {
        return {
          linkModalVisible: false,
          linkUrl: null,
        };
      },
      apply(tr, pluginState, prevEditorState, nextEditorState) {
        let linkUrl: string | null = null;
        const linkMark = nextEditorState.schema.marks.link!;

        // If cursor is within link
        if (
          nextEditorState.selection.empty &&
          linkMark.isInSet(nextEditorState.selection.$from.marks())
        ) {
          linkUrl = nextEditorState.selection.$from
            .marks()
            .find((mark: Mark) => mark.type.name === linkMark.name)?.attrs.href;
        }
        // If link is in text selection
        else if (
          nextEditorState.doc.rangeHasMark(
            nextEditorState.selection.$from.pos,
            nextEditorState.selection.$to.pos,
            linkMark,
          )
        ) {
          linkUrl =
            getActiveMarksWithAttrs(nextEditorState).find(
              ({ name }) => name === linkMark.name,
            )?.attrs?.href ?? null;
        }

        const nextPluginState: LinkPluginState = { ...pluginState, linkUrl };

        // @todo tye this action
        const action = tr.getMeta(linkPluginKey);

        switch (action?.type) {
          case "closeLinkModal":
            return { ...nextPluginState, linkModalVisible: false };
          case "openLinkModal":
            return { ...nextPluginState, linkModalVisible: true };
        }

        if (!prevEditorState.selection.eq(nextEditorState.selection)) {
          return { ...nextPluginState, linkModalVisible: false };
        }

        return nextPluginState;
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

    view(editorView: EditorView) {
      const mountNode = document.createElement("div");

      return {
        destroy() {
          renderPortal(null, mountNode);
          mountNode.remove();
        },
        update: (view: EditorView) => {
          ensureMounted(mountNode, document.body);
          const state = view.state;

          const linkPluginState = linkPluginKey.getState(view.state);
          const linkUrl = linkPluginState?.linkUrl;

          if (
            !markPluginKey.getState(editorView.state)?.focused ||
            (!linkUrl && !linkPluginState?.linkModalVisible)
          ) {
            renderPortal(null, mountNode);
            return;
          }

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
              style={{ left, top: bottom, position: "absolute", zIndex: "50" }}
              ref={linkModalRef}
            >
              <LinkModal
                savedLinkMarkHref={linkUrl ?? undefined}
                updateLink={(href) => {
                  updateLink(editorView, href);
                  editorView.dispatch(
                    editorView.state.tr.setMeta(linkPluginKey, {
                      type: "closeLinkModal",
                    }),
                  );
                }}
                removeLink={() => {
                  removeLink(editorView);
                  editorView.focus();
                }}
              />
            </div>,
            mountNode,
          );
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
  ] as Plugin<unknown>[];
}
