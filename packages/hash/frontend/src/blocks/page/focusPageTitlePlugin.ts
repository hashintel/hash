import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { RefObject } from "react";

export const createFocusPageTitlePlugin = (
  pageTitleRef: RefObject<HTMLTextAreaElement>,
) =>
  new Plugin<any, Schema>({
    props: {
      handleKeyDown: (view, event) => {
        const isArrowUp = event.key === "ArrowUp";

        if (!isArrowUp) return false;

        const { selection } = view.state;
        const posAtIndex = selection.$head.posAtIndex(0, 1);

        /** @todo `posAtIndex === 1` only works if first item is a text block, fix this */
        if (posAtIndex === 1) {
          pageTitleRef.current?.focus();

          return true;
        }

        return false;
      },
    },
  });
