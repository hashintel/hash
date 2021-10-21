import { toggleMark } from "prosemirror-commands";
import { Schema } from "prosemirror-model";
import { EditorState, NodeSelection, Plugin } from "prosemirror-state";
import React, { CSSProperties } from "react";
import { RenderPortal } from "../../blocks/page/usePortals";
import { ensureMounted } from "../../lib/dom";
import { MarksToolTip } from "./MarksTooltip";

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

export function createMarksTooltip(renderPortal: RenderPortal) {
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
      handleClick: () => {
        return false
      }
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
      // renderPortal(
      //   <div
      //     ref={(node) => {
      //       if (node) {
      //         node.appendChild(dom);
      //       }
      //     }}
      //   />,
      //   mountNode
      // );

      // const jsx = (
      //   <div style={{ position: "fixed", top: 20, left: 20 }}>
      //     <MarksToolTip />
      //   </div>
      // );

      // renderPortal(jsx, mountNode);

      const updateFns: Function[] = [];

      let style: CSSProperties = {
        // padding: "8px 7px 6px",
        position: "absolute",
        zIndex: 1,
        top: -10000,
        left: -10000,
        // marginTop: "-6px",
        opacity: 0,
        // backgroundColor: "#222",
        borderRadius: "4px",
        transition: "opacity 0.75s",
      };

      const renderPortalFn = (style: CSSProperties) => {
        const marks = new Set<string>();
        editorView.state.selection
          .content()
          .content.descendants((node: FixMeLater) => {
            for (const mark of node.marks) {
              marks.add(mark.type.name);
            }

            return true;
          });

        // todo how to make it rerender
        const jsx = (
          <div style={style}>
            <MarksToolTip
              marks={marks}
              toggleMark={(name) => {
                editorView.focus();
                toggleMark(
                  editorView.state.schema.marks[name],
                  name == "link" ? { href: "https://google.com" } : undefined
                )(editorView.state, editorView.dispatch);
              }}
            />
          </div>
        );

        renderPortal(jsx, mountNode);
      };

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
          // @todo consider moving styling to react component
          style = {
            ...style,
            opacity: 0,
            top: "-10000px",
            left: "-10000px",
          };
          renderPortalFn(style);
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

        // style = {
        //   ...style,
        //   opacity: 1,
        //   top: `${
        //     start.top - 50 + document.documentElement.scrollTop
        //   }px`,
        //   left: `${
        //     start.left -
        //     dom.offsetWidth / 2 +
        //     (end.right - start.left) / 2 +
        //     document.documentElement.scrollLeft
        //   }px`,
        // };


        style = {
          ...style,
          opacity: 1,
          top: `${start.top + document.documentElement.scrollTop}px`,
          left: `${
            start.left +
            (end.right - start.left) / 2 +
            document.documentElement.scrollLeft
          }px`,
          
        };

        for (const fn of updateFns) {
          fn();
        }

        renderPortalFn(style);
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
          renderPortal(null, mountNode);
          mountNode.remove();
          document.removeEventListener("dragstart", dragstart);
          document.removeEventListener("dragend", dragend);
        },
        update,
      };
    },
  });

  return marksTooltip as Plugin<unknown, Schema>;
}
