import { deriveStore, type StoreValues } from "../../react/derive-store";

import type { ReadableStore } from "@hashintel/petrinaut-core";
import type { RefCallback } from "react";

type Stores = Readonly<Record<string, ReadableStore<unknown>>>;
type Declarations = Readonly<Record<string, string>>;

/**
 * Keeps an element's inline style equal to a function of some stores' values,
 * from this call until the returned function runs: written at once and
 * whenever one of the stores changes, with no component rendering.
 *
 * For values that change on every pointer move or frame, such as a size
 * during a drag. `toStyle` returns CSS declarations under the names a
 * stylesheet uses (`width`, `margin-left`). Return only properties that
 * React's `style` prop on the same element does not set.
 *
 * The write goes to the one element that depends on the values. A custom
 * property on a shared ancestor would reach every reader with one write, but
 * the browser then restyles every element below that ancestor.
 */
export const bindStyleToStores = <Sources extends Stores>(
  element: HTMLElement,
  stores: Sources,
  toStyle: (values: StoreValues<Sources>) => Declarations,
): (() => void) => {
  const style = deriveStore(stores, toStyle);
  const write = (declarations: Declarations) => {
    for (const [property, text] of Object.entries(declarations)) {
      element.style.setProperty(property, text);
    }
  };
  write(style.get());

  return style.subscribe(write);
};

/** {@link bindStyleToStores} as a ref, for the element it is put on. */
export const styleFromStores =
  <Sources extends Stores>(
    stores: Sources,
    toStyle: (values: StoreValues<Sources>) => Declarations,
  ): RefCallback<HTMLElement> =>
  (element) =>
    element ? bindStyleToStores(element, stores, toStyle) : undefined;
