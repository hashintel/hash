import { useCallback, useEffect, useRef, useState } from "react";

type StateUpdate<Value> = Value | ((previous: Value) => Value);

const readStoredValue = (key: string): string | null | undefined => {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined;
  }
};

export const usePersistedState = <Value>({
  enabled,
  fallback,
  read,
  storageKey,
  write,
  writeWhenDisabled = false,
}: {
  readonly enabled: boolean;
  readonly fallback: Value;
  readonly read: () => Value;
  readonly storageKey?: string;
  readonly write: (value: Value) => void;
  readonly writeWhenDisabled?: boolean;
}): readonly [Value, (update: StateUpdate<Value>) => void, boolean] => {
  const [value, setValue] = useState(fallback);
  const [loadedMode, setLoadedMode] = useState<boolean>();
  const currentValueRef = useRef(fallback);
  const storedValueRef = useRef<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const storedValue =
        enabled && storageKey !== undefined
          ? readStoredValue(storageKey)
          : null;
      if (storedValue === undefined) return;
      const next = enabled ? read() : fallback;
      currentValueRef.current = next;
      storedValueRef.current =
        enabled && storageKey !== undefined
          ? (readStoredValue(storageKey) ?? storedValue)
          : null;
      setValue(next);
    };
    refresh();
    setLoadedMode(enabled);
    if (!enabled || storageKey === undefined) return;
    const onStorage = (event: StorageEvent) => {
      const storedValue = readStoredValue(storageKey);
      if (
        storedValue !== undefined &&
        event.storageArea === localStorage &&
        (event.key === storageKey || event.key === null) &&
        storedValue !== storedValueRef.current
      ) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [enabled, fallback, read, storageKey]);

  const updateValue = useCallback(
    (update: StateUpdate<Value>) => {
      if (!enabled && !writeWhenDisabled) return;
      const storedValue =
        storageKey === undefined ? null : readStoredValue(storageKey);
      const storageChanged =
        storedValue !== undefined && storedValue !== storedValueRef.current;
      const next =
        typeof update === "function"
          ? (update as (previous: Value) => Value)(
              (!enabled && storedValue !== undefined) || storageChanged
                ? read()
                : currentValueRef.current,
            )
          : update;
      currentValueRef.current = next;
      setValue(next);
      if (storedValue !== undefined) {
        write(next);
        storedValueRef.current =
          storageKey === undefined
            ? null
            : (readStoredValue(storageKey) ?? storedValue);
      }
    },
    [enabled, read, storageKey, write, writeWhenDisabled],
  );

  return [
    enabled ? value : fallback,
    updateValue,
    !enabled || loadedMode === enabled,
  ] as const;
};
