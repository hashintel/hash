/**
 * Utilities over plain objects with known keys.
 *
 * @module
 */

/** Flattens an intersection into a single object type for readable hovers. */
type Simplify<T> = { [Key in keyof T]: T[Key] } & {};

/** Keys whose value type admits `undefined`, including optional keys. */
type UndefinedKeys<T> = {
  [Key in keyof T]-?: undefined extends T[Key] ? Key : never;
}[keyof T];

/**
 * The result of {@link omitUndefined}: keys that admitted `undefined` become optional with `undefined` excluded from their value. `readonly` modifiers are retained.
 */
export type OmitUndefined<T> = Simplify<
  Pick<T, Exclude<Extract<keyof T, string | number>, UndefinedKeys<T>>> & {
    [Key in keyof Pick<
      T,
      Extract<UndefinedKeys<T>, string | number>
    >]?: Exclude<T[Key], undefined>;
  }
>;

/**
 * Copies the record without the keys whose value is `undefined`.
 *
 * Other falsy values and `null` are retained. Only own enumerable string keys are copied.
 *
 * @example
 * ```ts
 * const edge = Record.omitUndefined({ id, source, target, label });
 * ```
 */
export const omitUndefined = <T extends object>(
  record: T,
): OmitUndefined<T> => {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      Object.defineProperty(copy, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return copy as OmitUndefined<T>;
};
