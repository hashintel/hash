import {
  findComponentNodes,
  isParagraphNode,
} from "@hashintel/hash-shared/prosemirror";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { RenderPortal } from "../block-portals";
import { Placeholder } from "./placeholder";

interface PlaceholderPluginState {
  focused: boolean;
  editable: boolean;
}

const defaultState = { focused: false, editable: true };

const placeholderPluginKey = new PluginKey<PlaceholderPluginState>(
  "placeholderPlugin",
);

export const createPlaceholderPlugin = (renderPortal: RenderPortal) => {
  return new Plugin<PlaceholderPluginState>({
    key: placeholderPluginKey,
    state: {
      init() {
        return defaultState;
      },
      apply(tr, state) {
        const partialState = tr.getMeta(placeholderPluginKey);

        return partialState ? { ...state, ...partialState } : state;
      },
    },
    view(view) {
      const update = () => {
        const { editable } =
          placeholderPluginKey.getState(view.state) ?? defaultState;

        if (view.editable !== editable) {
          view.dispatch(
            view.state.tr.setMeta(placeholderPluginKey, {
              editable: view.editable,
            }),
          );
        }
      };

      update();
      return { update };
    },
    props: {
      decorations(state) {
        const firstNode = state.selection.$anchor.node(1);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
        const componentNode = firstNode && findComponentNodes(firstNode)[0];

        if (!componentNode) {
          return;
        }

        const pluginState =
          placeholderPluginKey.getState(state) ?? defaultState;
        const isFocused = pluginState.focused;
        const isEditable = pluginState.editable;
        const isParagraph = isParagraphNode(componentNode);

        const isEmpty = componentNode.childCount === 0;

        const showPlaceholder =
          isParagraph && isEmpty && isFocused && isEditable;

        if (!showPlaceholder) {
          return;
        }

        const widgetPos = state.selection.$anchor.posAtIndex(0, 1);

        const placeholderDecoration = Decoration.widget(
          widgetPos,
          () => {
            const mountNode = document.createElement("div");

            renderPortal(<Placeholder />, mountNode);

            return mountNode;
          },
          /**
           * passing a key prevents a focus related bug, by preventing re-creation of the dom node
           * @see https://github.com/hashintel/hash/pull/953#issuecomment-1222088538
           * */
          {
            key: "placeholder-deco",
            destroy: (node) => {
              renderPortal(null, node as HTMLElement);
            },
          },
        );

        return DecorationSet.create(state.doc, [placeholderDecoration]);
      },
      handleDOMEvents: {
        blur(view) {
          view.dispatch(
            view.state.tr.setMeta(placeholderPluginKey, { focused: false }),
          );
          return false;
        },
        focus(view) {
          /**
           * After two calls to setImmediate, Decoration.widget updates to it's new position,
           * and we wait until it updates to prevent blinking of placeholder in wrong position.
           */
          setImmediate(() => {
            setImmediate(() => {
              view.dispatch(
                view.state.tr.setMeta(placeholderPluginKey, { focused: true }),
              );
            });
          });

          return false;
        },
      },
    },
  }) as Plugin<unknown>;
};
