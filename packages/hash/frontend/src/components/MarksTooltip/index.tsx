import { ReplacePortals } from "@hashintel/hash-shared/sharedWithBackend";
import { toggleMark } from "prosemirror-commands";
import { Schema } from "prosemirror-model";
import { EditorState, NodeSelection, Plugin } from "prosemirror-state";
import React from "react";
import { ensureMounted } from "../../lib/dom";

interface MarksTooltipState {
  focused: boolean;
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

export function createMarksTooltip(replacePortal: ReplacePortals) {
  let timeout: NodeJS.Timeout;

  const marksTooltip = new Plugin<MarksTooltipState, Schema>({
    /**
     * This allows us to keep track of whether the view is focused, which
     * is important for knowing whether to show the format tooltip
     */
    state: {
      init() {
        return { focused: false };
      },
      apply(tr, state) {
        const formatBlur = tr.getMeta("format-blur");
        const formatFocus = tr.getMeta("format-focus");

        if (typeof formatBlur !== "undefined") {
          return { focused: false };
        }

        if (typeof formatFocus !== "undefined") {
          return { focused: true };
        }

        return state;
      },
    },
    props: {
      handleDOMEvents: {
        blur(view) {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            view.dispatch(view.state.tr.setMeta("format-blur", true));
          }, 200);
          return false;
        },
        focus(view) {
          clearTimeout(timeout);
          view.dispatch(view.state.tr.setMeta("format-focus", true));
          return false;
        },
      },
    },

    view(editorView: FixMeLater) {
      const mountNode = document.createElement("div");
      const dom = document.createElement("div");

      /**
       * This was originally written using DOM APIs directly, but we want
       * to ensure the tooltip is rendered within a React controlled
       * context, so we move the tooltip into a portal created by React.
       *
       * @todo fully rewrite this to use React completely
       */
      replacePortal(
        mountNode,
        mountNode,
        <div
          ref={(node) => {
            if (node) {
              node.appendChild(dom);
            }
          }}
        />
      );

      const updateFns: Function[] = [];

      const button = (name: string, text: string) => {
        const buttonElement = document.createElement("button");

        buttonElement.innerText = text;
        dom.appendChild(buttonElement);

        const update = () => {
          // @todo no idea if this is the best way to get a list of
          // marks in a selection
          const marks = new Set();
          editorView.state.selection
            .content()
            .content.descendants((node: FixMeLater) => {
              for (const mark of node.marks) {
                marks.add(mark.type.name);
              }

              return true;
            });

          const active = marks.has(name);

          buttonElement.style.backgroundColor = active ? "#2482ff" : "white";
          buttonElement.style.color = active ? "white" : "black";
          buttonElement.style.padding = "4px 0";
          buttonElement.style.width = "25px";
          buttonElement.style.border = "1px solid lightgrey";
        };

        buttonElement.addEventListener("click", (evt) => {
          evt.preventDefault();
          editorView.focus();
          toggleMark(editorView.state.schema.marks[name])(
            editorView.state,
            editorView.dispatch
          );
          update();
        });

        update();
        updateFns.push(update);
      };

      dom.style.cssText = `
        padding: 8px 7px 6px;
        position: absolute;
        z-index: 1;
        top: -10000;
        left: -10000;
        margin-top: -6px;
        opacity: 0;
        background-color: #222;
        border-radius: 4px;
        transition: opacity 0.75s;
      `;
      button("strong", "B");
      button("em", "I");
      button("underlined", "U");

      const update = (view: FixMeLater, lastState?: FixMeLater) => {
        ensureMounted(mountNode, document.body);

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
          !marksTooltip.getState(view.state).focused ||
          dragging ||
          state.selection instanceof NodeSelection ||
          // !(state.selection instanceof TextSelection) ||
          !selectionContainsText(state) ||
          state.selection.empty
        ) {
          dom.style.opacity = "0";
          dom.style.top = "-10000px";
          dom.style.left = "-10000px";
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

        dom.style.opacity = "1";
        dom.style.top = `${
          start.top - dom.offsetHeight + document.documentElement.scrollTop
        }px`;
        dom.style.left = `${
          start.left -
          dom.offsetWidth / 2 +
          (end.right - start.left) / 2 +
          document.documentElement.scrollLeft
        }px`;

        for (const fn of updateFns) {
          fn();
        }
      };

      update(editorView);

      const dragstart = () => {
        update(editorView);
      };

      const dragend = () => {
        update(editorView);
      };

      document.addEventListener("dragstart", dragstart);
      document.addEventListener("dragend", dragend);

      return {
        destroy() {
          replacePortal(mountNode, null, null);
          mountNode.remove();
          document.removeEventListener("dragstart", dragstart);
          document.removeEventListener("dragend", dragend);
        },
        update,
      };
    },
  });

  return marksTooltip;
}
