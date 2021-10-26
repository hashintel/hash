import { toggleMark } from "prosemirror-commands";
import { Schema } from "prosemirror-model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
} from "prosemirror-state";
import React, { CSSProperties } from "react";
import { tw } from "twind";
import { RenderPortal } from "../../blocks/page/usePortals";
import { ensureMounted } from "../../lib/dom";
import { MarksToolTip } from "./MarksTooltip";
import {
  checkIfSelectionIsEmpty,
  getActiveMarks,
  updateLink,
  selectionContainsText,
} from "./utils";


const TOOLTIP_ID = "hash_marks_tooltip";

interface MarksTooltipState {
  // focused: boolean;
  isSelectionEmpty: boolean;
}

interface MarksTooltipState {
  isSelectionEmpty: boolean;
}

const key = new PluginKey<MarksTooltipState, Schema>("markstooltip");

export function createMarksTooltip(renderPortal: RenderPortal) {
  let timeout: NodeJS.Timeout;

  const marksTooltip = new Plugin<MarksTooltipState, Schema>({
    key,
    /**
     * This allows us to keep track of whether the view is focused, which
     * is important for knowing whether to show the format tooltip
     */
    state: {
      init() {
        return { isSelectionEmpty: true };
      },
      apply(tr, state) {
        const action = tr.getMeta(key);
        if (typeof action !== "undefined") {
          return { ...state, ...action.payload };
        }

        return state;
      },
    },
    props: {
      handleDOMEvents: {},
      // this doesn't get triggered
      // transformPasted(slice) {
      //   console.log("slice ==> ", slice);
      //   return slice;
      // },
      // this doesn't get triggered
      // handlePaste(view, event, slice) {
      //   if (!event.clipboardData) {
      //     return false;
      //   }
      //   let text = event.clipboardData.getData("text/plain");
      //   const html = event.clipboardData.getData("text/html");

      //   const isPlainText = text && !html;

      //   if (!isPlainText || view.state.selection.empty) {
      //     console.log("selection empty");
      //     return false;
      //   }

      //   const { state, dispatch } = view;
      //   // @todo handle regex to be sure what was pasted was a link

      //   return createLink(text)(state, dispatch);
      // },
    },

    view(editorView: FixMeLater) {
      const mountNode = document.createElement("div");

      const renderPortalFn = (
        hidden: boolean,
        dimensions?: { top: number; left: number; bottom: number }
      ) => {
        let style: CSSProperties = {
          transition: "opacity 0.75s",
          position: "absolute",
          zIndex: 1,
          ...(hidden
            ? {
                top: -10000,
                left: -10000,
                opacity: 0,
              }
            : dimensions),
        };

        const activeMarks = getActiveMarks(editorView);

        const jsx = (
          <div className={tw`absolute`} style={style} id={TOOLTIP_ID}>
            <MarksToolTip
              activeMarks={activeMarks}
              toggleMark={(name, attrs) => {
                editorView.focus();
                toggleMark(editorView.state.schema.marks[name], attrs)(
                  editorView.state,
                  editorView.dispatch
                );
              }}
              updateLink={
                (href) =>
                  updateLink(href)(editorView.state, editorView.dispatch) // can just pick out editorView
              }
              // @todo use a better name
              space={dimensions ? dimensions.bottom - dimensions.top : 0}
            />
          </div>
        );
        ensureMounted(mountNode, document.body);
        renderPortal(jsx, mountNode);
      };

      const handleSelectionChange = (_) => {
        const toolTipEl = document.getElementById(TOOLTIP_ID);
        const selectionFocusNode = document.getSelection()?.focusNode;

        if (selectionFocusNode && toolTipEl?.contains(selectionFocusNode)) {
          return;
        }

        editorView.dispatch(
          editorView.state.tr.setMeta(key, {
            payload: {
              isSelectionEmpty: checkIfSelectionIsEmpty(
                document.getSelection()
              ),
            },
          })
        );
      };

      document.addEventListener("selectionchange", handleSelectionChange);

      return {
        destroy() {
          renderPortal(null, mountNode);
          mountNode.remove();
          document.removeEventListener("selectionchange", handleSelectionChange);
        },
        update: (view: FixMeLater, lastState?: FixMeLater) => {
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
            // !marksTooltip.getState(view.state).focused ||
            dragging ||
            state.selection instanceof NodeSelection ||
            // !(state.selection instanceof TextSelection) ||
            !selectionContainsText(state) ||
            // state.selection.empty ||
            key.getState(view.state)?.isSelectionEmpty
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
          const bottom = start.bottom + document.documentElement.scrollTop;

          renderPortalFn(false, { top, left, bottom });
        },
      };
    },
  });

  return marksTooltip as Plugin<unknown, Schema>;
}
