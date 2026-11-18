import type { ReadableStore } from "@hashintel/petrinaut-core";

/** The value type of each store in a record of stores. */
export type StoreValues<Stores> = {
  readonly [Name in keyof Stores]: Stores[Name] extends ReadableStore<
    infer Value
  >
    ? Value
    : never;
};

/**
 * A store computed from other stores.
 *
 * Its value keeps one identity until a source changes and, when `isSame` is
 * given, until the new value differs from the old by that test. A reader is
 * told of a change only then.
 */
export const deriveStore = <
  Stores extends Readonly<Record<string, ReadableStore<unknown>>>,
  Value,
>(
  sources: Stores,
  compute: (values: StoreValues<Stores>) => Value,
  isSame: (previous: Value, next: Value) => boolean = Object.is,
): ReadableStore<Value> => {
  const stores = Object.entries(sources);
  let cached: { inputs: unknown[]; value: Value } | undefined;

  const get = (): Value => {
    const inputs = stores.map(([, store]) => store.get());
    const previous = cached;
    if (
      previous?.inputs.every((input, index) => Object.is(input, inputs[index]))
    ) {
      return previous.value;
    }
    const next = compute(
      Object.fromEntries(
        stores.map(([name], index) => [name, inputs[index]]),
      ) as StoreValues<Stores>,
    );
    const value =
      previous && isSame(previous.value, next) ? previous.value : next;
    cached = { inputs, value };
    return value;
  };

  return {
    get,
    subscribe(listener) {
      let last = get();
      const unsubscribes = stores.map(([, store]) =>
        store.subscribe(() => {
          const next = get();
          if (next !== last) {
            last = next;
            listener(next);
          }
        }),
      );
      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
      };
    },
  };
};
