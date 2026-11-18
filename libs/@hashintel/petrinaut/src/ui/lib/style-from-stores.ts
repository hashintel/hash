import type { ReadableStore } from "@hashintel/petrinaut-core";
import type { RefCallback } from "react";

type ValuesOf<Stores> = {
  readonly [Name in keyof Stores]: Stores[Name] extends ReadableStore<
    infer Value
  >
    ? Value
    : never;
};

/**
 * A ref that keeps an element's inline style equal to a function of some
 * stores' values: written when the element attaches and whenever one of the
 * stores changes, with no component rendering.
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
export const styleFromStores =
  <Stores extends Readonly<Record<string, ReadableStore<unknown>>>>(
    stores: Stores,
    toStyle: (values: ValuesOf<Stores>) => Readonly<Record<string, string>>,
  ): RefCallback<HTMLElement> =>
  (element) => {
    if (!element) {
      return;
    }
    const write = () => {
      const values = Object.fromEntries(
        Object.entries(stores).map(([name, store]) => [name, store.get()]),
      ) as ValuesOf<Stores>;
      for (const [property, text] of Object.entries(toStyle(values))) {
        element.style.setProperty(property, text);
      }
    };
    write();
    const unsubscribes = Object.values(stores).map((store) =>
      store.subscribe(write),
    );

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  };
