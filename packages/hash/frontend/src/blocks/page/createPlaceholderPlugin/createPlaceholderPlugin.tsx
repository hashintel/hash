import { findComponentNodes } from "@hashintel/hash-shared/prosemirror";
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
        const decorations: Decoration[] = [];

        const pos = state.selection.$anchor.posAtIndex(0, 1);

        const firstNode = state.selection.$anchor.node(1);

        const focused = placeholderPluginKey.getState(state)?.focused;

        /** @todo show placeholder only for paragraphs */
        const shouldShowPlaceholder =
          firstNode &&
          findComponentNodes(firstNode)[0]?.childCount === 0 &&
          focused;

        if (shouldShowPlaceholder) {
          const placeholderDecoration = Decoration.widget(pos, () => {
            /**
             * @todo when focus changes, the old placeholder blinks for a moment
             * @ask could this be related with https://prosemirror.net/docs/ref/#view.Decoration^widget
             * It is recommended that you delay rendering the widget by passing a function
             * that will be called when the widget is actually drawn in a view,
             * but you can also directly pass a DOM node.
             *  */
            const mountNode = document.createElement("div");

            renderPortal(<Placeholder />, mountNode);

            return mountNode;
          });

          decorations.push(placeholderDecoration);
        }

        /** @todo pass generic to DecorationSet properly */
        // eslint-disable-next-line no-restricted-syntax
        return DecorationSet.create(state.doc, decorations);
      },
      handleDOMEvents: {
        blur(view) {
          view.dispatch(view.state.tr.setMeta(placeholderPluginKey, false));
          return false;
        },
        focus(view) {
          view.dispatch(view.state.tr.setMeta(placeholderPluginKey, true));
          return false;
        },
      },
    },
  }) as Plugin<unknown, Schema>;
};
