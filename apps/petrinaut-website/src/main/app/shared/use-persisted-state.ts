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
  fallback,
  read,
  storageKey,
  write,
}: {
  readonly fallback: Value;
  readonly read: () => Value;
  readonly storageKey?: string;
  readonly write: (value: Value) => void;
}): readonly [Value, (update: StateUpdate<Value>) => void, boolean] => {
  const [value, setValue] = useState(fallback);
  const [ready, setReady] = useState(false);
  const currentValueRef = useRef(fallback);
  const storedValueRef = useRef<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const storedValue =
        storageKey === undefined ? null : readStoredValue(storageKey);
      if (storedValue === undefined) return;
      const next = read();
      currentValueRef.current = next;
      storedValueRef.current =
        storageKey === undefined
          ? null
          : (readStoredValue(storageKey) ?? storedValue);
      setValue(next);
    };
    refresh();
    // Hydrate from external storage after mount, then expose its readiness.
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- Tracks completion of the localStorage synchronization above.
    setReady(true);
    if (storageKey === undefined) return;
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
  }, [read, storageKey]);

  const updateValue = useCallback(
    (update: StateUpdate<Value>) => {
      const storedValue =
        storageKey === undefined ? null : readStoredValue(storageKey);
      const storageChanged =
        storedValue !== undefined && storedValue !== storedValueRef.current;
      const next =
        typeof update === "function"
          ? (update as (previous: Value) => Value)(
              storageChanged ? read() : currentValueRef.current,
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
    [read, storageKey, write],
  );

  return [value, updateValue, ready] as const;
};
