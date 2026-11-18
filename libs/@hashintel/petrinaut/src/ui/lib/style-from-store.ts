import type { ReadableStore } from "@hashintel/petrinaut-core";
import type { RefCallback } from "react";

/**
 * A ref that keeps an element's inline style equal to a function of a store's
 * value: written when the element attaches and on every change after, with no
 * component rendering.
 *
 * For values that change on every pointer move or frame, such as a size
 * during a drag. `toStyle` returns CSS declarations under the names a
 * stylesheet uses (`width`, `margin-left`). Return only properties that
 * React's `style` prop on the same element does not set.
 *
 * The write goes to the one element that depends on the value. A custom
 * property on a shared ancestor would reach every reader with one write, but
 * the browser then restyles every element below that ancestor.
 */
export const styleFromStore =
  <Value>(
    store: ReadableStore<Value>,
    toStyle: (value: Value) => Readonly<Record<string, string>>,
  ): RefCallback<HTMLElement> =>
  (element) => {
    if (!element) {
      return;
    }
    const write = (value: Value) => {
      for (const [property, text] of Object.entries(toStyle(value))) {
        element.style.setProperty(property, text);
      }
    };
    write(store.get());

    return store.subscribe(write);
  };
