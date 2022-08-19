import { paragraphBlockComponentId } from "@hashintel/hash-shared/blocks";
import {
  componentNodeToId,
  findComponentNodes,
} from "@hashintel/hash-shared/prosemirror";
import { Schema } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { RenderPortal } from "../usePortals";
import { Placeholder } from "./Placeholder";

interface PlaceholderPluginState {
  focused: boolean;
}

const placeholderPluginKey = new PluginKey<PlaceholderPluginState, Schema>(
  "placeholderPlugin",
);

export const createPlaceholderPlugin = (renderPortal: RenderPortal) => {
  return new Plugin<PlaceholderPluginState, Schema>({
    key: placeholderPluginKey,
    state: {
      init() {
        return { focused: false };
      },
      apply(tr, state) {
        const focused = tr.getMeta(placeholderPluginKey);

        // return the old state if transaction does not have focused meta
        if (focused === undefined) {
          return state;
        }

        return { focused };
      },
    },
    props: {
      decorations(state) {
        const firstNode = state.selection.$anchor.node(1);

        if (!firstNode) return;

        const componentId = componentNodeToId(
          findComponentNodes(firstNode)[0]!,
        );

        const isFocused = placeholderPluginKey.getState(state)?.focused;
        const isParagraph = componentId === paragraphBlockComponentId;
        const isEmpty = findComponentNodes(firstNode)[0]?.childCount === 0;

        const showPlaceholder = isParagraph && isEmpty && isFocused;

        if (!showPlaceholder) return;

        const widgetPos = state.selection.$anchor.posAtIndex(0, 1);

        const placeholderDecoration = Decoration.widget(widgetPos, () => {
          const mountNode = document.createElement("div");

          renderPortal(<Placeholder />, mountNode);

          return mountNode;
        });

        return DecorationSet.create(state.doc, [placeholderDecoration]);
      },
      handleDOMEvents: {
        blur(view) {
          view.dispatch(view.state.tr.setMeta(placeholderPluginKey, false));
          return false;
        },
        focus(view) {
          // this if prevents rendering `Placeholder` on readonly mode
          if (!view.editable) return false;

          /**
           * After two calls to setImmediate, Decoration.widget updates to it's new position,
           * and we wait until it updates to prevent blinking of placeholder in wrong position.
           */
          setImmediate(() => {
            setImmediate(() => {
              view.dispatch(view.state.tr.setMeta(placeholderPluginKey, true));
            });
          });

          return false;
        },
      },
    },
  }) as Plugin<unknown, Schema>;
};
