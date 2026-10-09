import { Plugin, PluginKey } from "prosemirror-state";

import { ensureMounted } from "../../../lib/dom";
import { ErrorView } from "./create-error-plugin/error-view";

import type { RenderPortal } from "./block-portals";
import type { ErrorProps } from "./create-error-plugin/error-view";
import type { Transaction } from "prosemirror-state";

const defaultErrorProps = { errored: false };

export const createErrorPlugin = (renderPortal: RenderPortal) => {
  // eslint-disable-next-line no-restricted-syntax -- prosemirror typing error
  const key = new PluginKey<ErrorProps>();

  return [
    // eslint-disable-next-line no-restricted-syntax -- prosemirror typing error
    new Plugin<ErrorProps>({
      key,
      state: {
        init() {
          return defaultErrorProps;
        },
        apply(tr: Transaction, value: ErrorProps) {
          if (typeof tr.getMeta(key) === "boolean") {
            return { errored: true };
          }

          return value;
        },
      },
      props: {
        editable(state) {
          return !key.getState(state)?.errored;
        },
      },
      view(view) {
        const mountNode = document.createElement("div");

        return {
          update() {
            const props = key.getState(view.state) ?? defaultErrorProps;

            ensureMounted(mountNode, document.body);
            renderPortal(<ErrorView {...props} />, mountNode);
          },
          destroy() {
            renderPortal(null, mountNode);
            mountNode.remove();
          },
        };
      },
      // eslint-disable-next-line no-restricted-syntax -- prosemirror typing error
    }) as Plugin<unknown>,
    (tr: Transaction) => {
      // @todo log
      return tr.setMeta(key, true);
    },
  ] as const;
};
