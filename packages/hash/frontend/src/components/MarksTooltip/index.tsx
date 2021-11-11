import { toggleMark } from "prosemirror-commands";
import { inputRules } from "prosemirror-inputrules";
import { Mark, Schema } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
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
  isValidLink,
  linkInputRule,
  selectionContainsText,
  updateLink,
} from "./util";
import { ProsemirrorNode } from "@hashintel/hash-shared/node";

interface MarksTooltipState {
  focused: boolean;
}

interface LinkPluginState {
  linkModalVisible: boolean | undefined;
  linkUrl: null | string;
}

const markPluginKey = new PluginKey<MarksTooltipState, Schema>("markPlugin");
const linkPluginKey = new PluginKey<LinkPluginState, Schema>("linkPlugin");

export function createFormatPlugins(renderPortal: RenderPortal) {
  let timeout: NodeJS.Timeout;

  const linkModalRef = React.createRef<HTMLDivElement>();

  const marksTooltip = new Plugin<MarksTooltipState, Schema>({
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
            <div className={tw`absolute z-30`} style={{ top, left }}>
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
        return {
          linkModalVisible: undefined,
          linkUrl: null,
        };
      },
      apply(tr, pluginState, prevEditorState, nextEditorState) {
        // if (
        //   !markPluginKey.getState(nextEditorState)?.focused ||
        //   nextEditorState.selection instanceof NodeSelection
        // ) {
        //   renderPortal(null, mountNode);
        //   return;
        // }

        let linkUrl: string | null = null;
        const linkMark = nextEditorState.schema.marks.link;

        // If cursor is within link
        if (
          nextEditorState.selection.empty &&
          linkMark.isInSet(nextEditorState.selection.$from.marks())
        ) {
          linkUrl = nextEditorState.selection.$from
            .marks()
            ?.find((mark: Mark) => mark.type.name === "link")?.attrs.href;
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
              ({ name }) => name === "link",
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
              style={{ left, top: bottom }}
              className={tw`absolute z-50`}
              ref={linkModalRef}
            >
              <LinkModal
                defaultLinkMarkHref={linkUrl ?? undefined}
                updateLink={(href) => {
                  updateLink(editorView, href);
                  editorView.dispatch(
                    editorView.state.tr.setMeta(linkPluginKey, {
                      type: "closeLinkModal",
                    }),
                  );
                }}
                removeLink={() => {
                  const editorState = editorView.state;
                  const { selection, tr, schema } = editorState;
                  const linkMarkType = schema.marks.link;

                  tr.setMeta(linkPluginKey, { type: "closeLinkModal " });

                  if (selection instanceof TextSelection) {
                    const textSelection: TextSelection<Schema> = selection;
                    const { $cursor } = textSelection;

                    if ($cursor) {
                      const nodesBefore: [number, ProsemirrorNode<Schema>][] =
                        [];
                      const nodesAfter: [number, ProsemirrorNode<Schema>][] =
                        [];

                      $cursor.parent.nodesBetween(
                        0,
                        $cursor.parentOffset,
                        (node, pos) => {
                          nodesBefore.push([pos, node]);
                        },
                      );

                      $cursor.parent.nodesBetween(
                        $cursor.parentOffset,
                        $cursor.parent.content.size,
                        (node, pos) => {
                          nodesAfter.push([pos, node]);
                        },
                      );

                      let startPosition = textSelection.$from.pos;
                      let endPosition = textSelection.$to.pos;

                      let targetMark: Mark<Schema> | null = null;

                      for (let idx = nodesBefore.length - 1; idx > 0; idx--) {
                        const [pos, node] = nodesBefore[idx];

                        const linkMark = targetMark
                          ? node.marks.includes(targetMark)
                            ? targetMark
                            : null
                          : node.marks.find(
                              (mark) => mark.type === linkMarkType,
                            );

                        if (linkMark) {
                          targetMark = linkMark;
                          startPosition = pos;
                        } else {
                          break;
                        }
                      }

                      for (let idx = 0; idx < nodesAfter.length; idx++) {
                        const [pos, node] = nodesAfter[idx];

                        const linkMark = targetMark
                          ? node.marks.includes(targetMark)
                            ? targetMark
                            : null
                          : node.marks.find(
                              (mark) => mark.type === linkMarkType,
                            );

                        if (linkMark) {
                          targetMark = linkMark;
                          endPosition = pos + node.nodeSize;
                        } else {
                          break;
                        }
                      }

                      startPosition += $cursor.start($cursor.depth);

                      endPosition += $cursor.start($cursor.depth);

                      tr.removeMark(startPosition, endPosition, linkMarkType);
                    } else {
                      tr.removeMark(
                        textSelection.from,
                        textSelection.to,
                        linkMarkType,
                      );
                    }
                  }

                  editorView.dispatch(tr);
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
  ] as Plugin<unknown, Schema>[];
}
