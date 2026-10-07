import { useState } from "react";

type Held<T> =
  | { readonly key: string; readonly value: T }
  | { readonly key: null; readonly value: null };

const hold = <T>(key: string | null, create: (key: string) => T): Held<T> =>
  key === null ? { key, value: null } : { key, value: create(key) };

/**
 * One instance per key: created when the key changes, kept while it holds,
 * `null` without a key. It is state, where `useMemo` is a cache React may
 * drop, for objects whose identity other code relies on.
 */
export const useInstanceFor = <T>(
  key: string | null,
  create: (key: string) => T,
): T | null => {
  // It creates per key during render; a compiler memo of `create()`, keyed
  // without `key`, would hand a new key the old instance.
  "use no memo";

  // The held key is the key of the previous render.
  const [held, setHeld] = useState(() => hold(key, create));
  if (key !== held.key) {
    const next = hold(key, create);
    setHeld(next);

    return next.value;
  }

  return held.value;
};
