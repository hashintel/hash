import { useState } from "react";

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

  const [instance, setInstance] = useState<{ key: string; value: T } | null>(
    null,
  );
  if (key === null) {
    if (instance !== null) setInstance(null);

    return null;
  }
  if (instance?.key !== key) {
    const next = { key, value: create(key) };
    setInstance(next);

    return next.value;
  }

  return instance.value;
};
