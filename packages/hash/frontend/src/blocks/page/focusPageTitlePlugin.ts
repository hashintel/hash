import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";

export const focusPageTitlePlugin = new Plugin<any, Schema>({
  props: {
    handleKeyDown: (view, event) => {
      const isArrowUp = event.key === "ArrowUp";

      if (!isArrowUp) return false;

      const { selection } = view.state;
      const posAtIndex = selection.$head.posAtIndex(0, 1);

      /** @todo `posAtIndex === 1` only works if first item is a text block, fix this */
      if (posAtIndex === 1) {
        const pageTitle =
          document.querySelector<HTMLHeadingElement>("h1#hash-page-title");

        pageTitle?.focus();

        return true;
      }

      return false;
    },
  },
});
