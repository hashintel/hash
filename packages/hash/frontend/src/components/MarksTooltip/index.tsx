import { toggleMark } from "prosemirror-commands";
import { Schema } from "prosemirror-model";
import { NodeSelection, Plugin, PluginKey } from "prosemirror-state";
import React, { CSSProperties } from "react";
import { tw } from "twind";
import { RenderPortal } from "../../blocks/page/usePortals";
import { ensureMounted } from "../../lib/dom";
import { MarksTooltip } from "./MarksTooltip";
import {
  getActiveMarksWithAttrs,
  updateLink,
  selectionContainsText,
  validateLink,
} from "./util";

const TOOLTIP_ID = "hash_marks_tooltip";

interface MarksTooltipState {
  focused: boolean;
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
        return { isSelectionEmpty: true, focused: false };
      },
      apply(tr, state) {
        const action = tr.getMeta(key);

        switch (action?.type) {
          case "format-blur":
            return { focused: false };
          case "format-focus":
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
            const toolTipEl = document.getElementById(TOOLTIP_ID);

            if (toolTipEl?.contains(document.activeElement)) {
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

    view(editorView: FixMeLater) {
      const mountNode = document.createElement("div");

      const renderPortalFn = (dimensions: {
        top: number;
        left: number;
        bottom: number;
      }) => {
        const activeMarks = getActiveMarksWithAttrs(editorView);

        const style: CSSProperties = {
          top: dimensions.top,
          left: dimensions.left,
        };

        const jsx = (
          <div className={tw`absolute z-50`} style={style} id={TOOLTIP_ID}>
            <MarksTooltip
              activeMarks={activeMarks}
              toggleMark={(name, attrs) => {
                toggleMark(editorView.state.schema.marks[name], attrs)(
                  editorView.state,
                  editorView.dispatch
                );
              }}
              updateLink={(href) => {
                updateLink(editorView, href);
              }}
              closeTooltip={() =>
                editorView.dispatch(
                  editorView.state.tr.setMeta(key, { type: "format-blur" })
                )
              }
              selectionHeight={dimensions.bottom - dimensions.top}
            />
          </div>
        );
        ensureMounted(mountNode, document.body);
        renderPortal(jsx, mountNode);
      };

      const handlePaste = (evt: ClipboardEvent) => {
        if (!evt.clipboardData) {
          return;
        }

        const text = evt.clipboardData.getData("text/plain");
        const html = evt.clipboardData.getData("text/html");
        const isPlainText = Boolean(text) && !html;

        if (isPlainText && validateLink(text)) {
          evt.preventDefault();
          updateLink(editorView, text);
        }
      };

      document.addEventListener("paste", handlePaste);

      return {
        destroy() {
          renderPortal(null, mountNode);
          mountNode.remove();
          document.removeEventListener("paste", handlePaste);
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
           * @todo confirm if we need all these conditions
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
          const bottom = end.bottom + document.documentElement.scrollTop;

          renderPortalFn({ top, left, bottom });
        },
      };
    },
  });

  return marksTooltip as Plugin<unknown, Schema>;
}
