import { useState } from "react";

type DraftFieldState<T> = {
  sourceId: string;
  sourceValue: T;
  value: T;
  error: string | null;
};

/**
 * Tracks local draft state for a value owned by an external source.
 *
 * The draft value and validation error are preserved only while both
 * `sourceId` and `sourceValue` still match the current source. When the user
 * switches entity, or the canonical source value changes, stale draft/error
 * state is discarded without a prop-to-state syncing effect.
 *
 * `sourceValue` is compared with `Object.is`, so it must be a primitive (or a
 * reference-stable object held across renders). Passing a freshly built
 * object literal each render would discard the draft on every parent
 * re-render. Existing callers pass strings (entity names) and are fine.
 *
 * @example
 * ```ts
 * const nameDraft = useDraftField({
 *   sourceId: place.id,
 *   sourceValue: place.name,
 * });
 *
 * <TextInput
 *   value={nameDraft.value}
 *   onChange={(event) => nameDraft.setValue(event.target.value)}
 * />
 * ```
 */
export const useDraftField = <T>({
  sourceId,
  sourceValue,
}: {
  sourceId: string;
  sourceValue: T;
}) => {
  const [state, setState] = useState<DraftFieldState<T> | null>(null);

  const isCurrent = state?.sourceId === sourceId && Object.is(state.sourceValue, sourceValue);
  const value = isCurrent ? state.value : sourceValue;
  const error = isCurrent ? state.error : null;

  const setValue = (nextValue: T) => {
    setState((current) => {
      const keepError =
        current?.sourceId === sourceId && Object.is(current.sourceValue, sourceValue);

      return {
        sourceId,
        sourceValue,
        value: nextValue,
        error: keepError ? current.error : null,
      };
    });
  };

  const setError = (nextError: string | null) => {
    setState((current) => {
      const currentValue =
        current?.sourceId === sourceId && Object.is(current.sourceValue, sourceValue)
          ? current.value
          : sourceValue;

      return {
        sourceId,
        sourceValue,
        value: currentValue,
        error: nextError,
      };
    });
  };

  return { value, setValue, error, setError };
};
