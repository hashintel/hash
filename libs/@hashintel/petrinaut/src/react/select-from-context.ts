import { use, useLayoutEffect, useState, type Context } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

import {
  createReadableStore,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import { constantStore } from "./use-store";

/**
 * What a provider publishes for its readers by selector: its latest context
 * value. Null where nothing publishes, such as under a test that provides the
 * context on its own.
 */
export type Published<Value> = ReadableStore<Value> | null;

/**
 * Publishes a provider's context value for {@link useSelected}. The provider
 * gives the result out through a context of its own, above the context it
 * mirrors: the result keeps one identity, so that context never renders a
 * reader.
 *
 * The value is published once React has committed it, and before the browser
 * paints. A reader by selector whose part changed renders then, in the same
 * frame as the readers of the context.
 */
export const usePublished = <Value>(value: Value): ReadableStore<Value> => {
  const [published] = useState(() => createReadableStore(value));
  useLayoutEffect(() => {
    published.set(value);
  }, [published, value]);
  return published;
};

const nothing = Symbol("nothing published");
const nothingPublished = constantStore<typeof nothing>(nothing);

/**
 * One part of a context value. The reader renders when that part changes,
 * where `use(context)` renders it whenever any part of the value does.
 *
 * `select` picks the part. Pick a value that keeps its identity while it says
 * the same, such as a field of the context value: an object or array built
 * inside `select` is new on every change and renders the reader each time.
 *
 * Where nothing is published the reader follows the context itself, so a
 * test or a story can provide the context alone. A bare provider of the
 * context below a publishing one is not seen here.
 */
export const useSelected = <Value, Selected>(
  context: Context<Value>,
  publishedContext: Context<Published<Value>>,
  select: (value: Value) => Selected,
  isSame?: (previous: Selected, next: Selected) => boolean,
): Selected => {
  const published = use(publishedContext) ?? nothingPublished;
  const selected = useSyncExternalStoreWithSelector<
    Value | typeof nothing,
    Selected | typeof nothing
  >(
    (onStoreChange) => published.subscribe(onStoreChange),
    () => published.get(),
    () => published.get(),
    (value) => (value === nothing ? nothing : select(value)),
    isSame &&
      ((previous, next) =>
        previous !== nothing && next !== nothing && isSame(previous, next)),
  );
  // `use` is the one hook that may sit in a condition.
  return selected === nothing ? select(use(context)) : selected;
};

/**
 * Several fields of a context value, by name. The reader renders when one of
 * them changes.
 */
export const useSelectedFields = <
  Value extends object,
  Key extends keyof Value,
>(
  context: Context<Value>,
  publishedContext: Context<Published<Value>>,
  keys: readonly Key[],
): Pick<Value, Key> =>
  useSelected(
    context,
    publishedContext,
    (value) => {
      const fields = {} as Pick<Value, Key>;
      for (const key of keys) {
        fields[key] = value[key];
      }
      return fields;
    },
    (previous, next) => keys.every((key) => previous[key] === next[key]),
  );
