import { useCallback, useEffect, useRef, useState } from "react";

type StateUpdate<Value> = Value | ((previous: Value) => Value);

export const usePersistedState = <Value>({
  enabled,
  fallback,
  read,
  write,
  writeWhenDisabled = false,
}: {
  readonly enabled: boolean;
  readonly fallback: Value;
  readonly read: () => Value;
  readonly write: (value: Value) => void;
  readonly writeWhenDisabled?: boolean;
}): readonly [Value, (update: StateUpdate<Value>) => void, boolean] => {
  const [value, setValue] = useState(fallback);
  const [loadedMode, setLoadedMode] = useState<boolean>();
  const currentValueRef = useRef(fallback);

  useEffect(() => {
    const next = enabled ? read() : fallback;
    currentValueRef.current = next;
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- persisted browser state is synchronized only after commit
    setValue(next);
    setLoadedMode(enabled);
  }, [enabled, fallback, read]);

  const updateValue = useCallback(
    (update: StateUpdate<Value>) => {
      if (!enabled && !writeWhenDisabled) return;
      const next =
        typeof update === "function"
          ? (update as (previous: Value) => Value)(currentValueRef.current)
          : update;
      currentValueRef.current = next;
      setValue(next);
      write(next);
    },
    [enabled, write, writeWhenDisabled],
  );

  return [
    enabled ? value : fallback,
    updateValue,
    !enabled || loadedMode === enabled,
  ] as const;
};
