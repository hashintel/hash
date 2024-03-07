/**
 * A collection of helper methods which provide better typed iteration over Objects.
 */

// @todo deduplicate this and libs/mock-block-dock/src/util.ts

type TupleEntry<
  T extends readonly unknown[],
  I extends unknown[] = [],
  R = never,
> = T extends readonly [infer Head, ...infer Tail]
  ? TupleEntry<Tail, [...I, unknown], R | [`${I["length"]}`, Head]>
  : R;

type ObjectEntry<T extends Record<string, unknown>> = T extends object
  ? { [K in keyof T]: [K, Required<T>[K]] }[keyof T] extends infer E
    ? E extends [infer K, infer V]
      ? K extends string | number
        ? [`${K}`, V]
        : never
      : never
    : never
  : never;

type Entry<T extends Record<string, unknown>> = T extends readonly [
  unknown,
  ...unknown[],
]
  ? TupleEntry<T>
  : T extends ReadonlyArray<infer U>
    ? [`${number}`, U]
    : ObjectEntry<T>;

/** `Object.entries` analogue which returns a well-typed array
 *
 * Source: https://dev.to/harry0000/a-bit-convenient-typescript-type-definitions-for-objectentries-d6g
 */
export const typedEntries = <T extends Record<string, unknown>>(
  object: T,
): ReadonlyArray<Entry<T>> => {
  return Object.entries(object) as unknown as ReadonlyArray<Entry<T>>;
};

/** `Object.values` analogue which returns a well-typed array */
export const typedKeys = <T extends Record<string, unknown>>(
  object: T,
): Entry<T>[0][] => {
  return Object.keys(object) as Entry<T>[0][];
};

/** `Object.values` analogue which returns a well-typed array */
export const typedValues = <T extends Record<string, unknown>>(
  object: T,
): Entry<T>[1][] => {
  return Object.values(object);
};
