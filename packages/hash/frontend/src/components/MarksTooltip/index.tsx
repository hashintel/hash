import { toggleMark } from "prosemirror-commands";
import { Schema } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
} from "prosemirror-state";
import React, { CSSProperties } from "react";
import { tw } from "twind";
import { RenderPortal } from "../../blocks/page/usePortals";
import { ensureMounted } from "../../lib/dom";
import { MarksToolTip } from "./MarksTooltip";
import { updateLink } from './utils'



// @todo Continue from trying to handle pasted links


interface MarksTooltipState {
  // focused: boolean;
  isSelectionEmpty: boolean;
}

const selectionContainsText = (state: EditorState<Schema>) => {
  const content = state.selection.content().content;
  let containsText = false;

  content.descendants((node) => {
    if (containsText) {
      return false;
    }

    if (node.isTextblock) {
      containsText = true;
      return false;
    }

    return true;
  });

  return containsText;
};

// check out bangle dev and tip tap implementation of updating the links
// https://github.com/bangle-io/bangle.dev/blob/d5363e385a89aea26bf8f90fa543bda06692a4d7/core/components/link.js#L26

const isEmpty = (selection: Selection) =>
  selection.rangeCount === 1 && selection.getRangeAt(0).toString() === "";

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
      // handleDOMEvents: {},
      // handlePaste: (view, evt) => {
      //   // either try linkifyjs or use regex
      //   console.log('this was pasted => ', evt.clipboardData?.getData('text/plain'))

      //   return true
      // },

      // tiptap   packages/extension-link/src/link.ts

      // handlePaste: (view, event, slice) => {
      //   if (!event.clipboardData) {
      //     return false;
      //   }
      //   let text = event.clipboardData.getData("text/plain");
      //   const html = event.clipboardData.getData("text/html");

      //   const isPlainText = text && !html;

      //   if (!isPlainText || view.state.selection.empty) {
      //     return false;
      //   }

      //   const { state, dispatch } = view;
      //   // @todo handle regex to be sure what was pasted was a link

      //   // const match = matchAllPlus(regexp, text);
      //   // const singleMatch = match.length === 1 && match.every((m) => m.match);
      //   // // Only handle if paste has one URL
      //   // if (!singleMatch) {
      //   //   return false;
      //   // }

      //   return createLink(text)(state, dispatch);
      // },

      // transformPastedText: (slice) => {
      //   console.log('slice ==> ', slice)
      //   return false
      // },

      // handlePaste: (view, event, slice) => {
      //   console.log('slice ==> ', slice)
      //   if (!event.clipboardData) {
      //     return false;
      //   }
      //   let text = event.clipboardData.getData("text/plain");
      //   const html = event.clipboardData.getData("text/html");

      //   const isPlainText = text && !html;

      //   if (!isPlainText || view.state.selection.empty) {
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

        const marks = new Set<{
          name: string;
          attrs?: Record<string, string>;
        }>();

        const activeMarks: { name: string; attrs?: Record<string, string> }[] =
          [];

        console.log("selection => ", editorView.state.selection.content());

        editorView.state.selection
          .content()
          .content.descendants((node: FixMeLater) => {
            for (const mark of node.marks) {
              // marks.add(mark.type.name);
              activeMarks.push({
                name: mark.type.name,
                attrs: mark.attrs,
              });
              // marks.add(mark);
            }

            return true;
          });

        // todo how to make it rerender
        const jsx = (
          <div className={tw`absolute`} style={style} id="test-div">
            <MarksToolTip
              marks={activeMarks}
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

      const selectionchange = (evt) => {
        const x = document.getElementById("test-div");

        if (x?.contains(document.getSelection()?.focusNode)) {
          return;
        }

        editorView.dispatch(
          editorView.state.tr.setMeta(key, {
            payload: { isSelectionEmpty: isEmpty(document.getSelection()) },
          })
        );
      };

      document.addEventListener("selectionchange", selectionchange);

      return {
        destroy() {
          renderPortal(null, mountNode);
          mountNode.remove();
          document.removeEventListener("selectionchange", selectionchange);
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
            key.getState(view.state).isSelectionEmpty
          ) {
            renderPortal(null, mountNode);
            // renderPortalFn(true);
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
