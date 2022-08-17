import { paragraphBlock } from "@hashintel/hash-shared/blocks";
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

        const componentId = firstNode
          ? componentNodeToId(findComponentNodes(firstNode)[0]!)
          : null;

        const focused = placeholderPluginKey.getState(state)?.focused;
        const isParagraph = componentId === paragraphBlock;

        const showPlaceholder =
          isParagraph &&
          firstNode &&
          findComponentNodes(firstNode)[0]?.childCount === 0 &&
          focused;

        /** @todo pass generic to DecorationSet properly */
        // eslint-disable-next-line no-restricted-syntax
        if (!showPlaceholder) return DecorationSet.create(state.doc, []);

        const widgetPos = state.selection.$anchor.posAtIndex(0, 1);

        const placeholderDecoration = Decoration.widget(widgetPos, () => {
          /**
           * @todo when focus changes, the old placeholder blinks for a moment
           * this could be related with the focused state changing true-false, or
           * @see https://prosemirror.net/docs/ref/#view.Decoration^widget
           *  */
          const mountNode = document.createElement("div");

          renderPortal(<Placeholder />, mountNode);

          return mountNode;
        });

        // eslint-disable-next-line no-restricted-syntax
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

          view.dispatch(view.state.tr.setMeta(placeholderPluginKey, true));
          return false;
        },
      },
    },
  }) as Plugin<unknown, Schema>;
};
