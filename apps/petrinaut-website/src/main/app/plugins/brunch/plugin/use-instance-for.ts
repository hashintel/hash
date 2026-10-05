import { useState } from "react";

/**
 * One instance per key: created when the key changes, kept while it holds,
 * `null` without a key. It is state, where `useMemo` is a cache React may
 * drop, for objects whose identity other code relies on.
 */
export const useInstanceFor = <T>(
  key: string | null,
  create: () => T,
): T | null => {
  const [instance, setInstance] = useState<{ key: string; value: T } | null>(
    null,
  );
  if (key === null) {
    if (instance !== null) setInstance(null);

    return null;
  }
  if (instance?.key !== key) {
    const next = { key, value: create() };
    setInstance(next);

    return next.value;
  }

  return instance.value;
};
