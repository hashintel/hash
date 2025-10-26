/**
 * 'Omit' for use on a union, to 'distribute' the omit across the union, rather than applying it to an intersection of the union
 * – 'Omit' applies to an intersection because it applies keyof to T, which gives an interaction of the keys of union T.
 * We must use a conditional mapped type to apply the Omit to each member of the union instead.
 * @see https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type DistributivePick<T, K extends keyof T> = T extends unknown
  ? Pick<T, K>
  : never;

export type DistributiveField<T, K> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

/**
 * Replace properties in a union type, distributing the replacement across each member of the union,
 * and enforcing mutual exclusion with `?: never` properties.
 *
 * This is equivalent to `ExclusiveUnion<DistributiveOmit<T, keyof R> & R>` but more concise.
 *
 * @example
 * ```typescript
 * type Original = { a: string; old: number } | { b: string; old: number };
 * type Replaced = DistributiveReplaceProperties<Original, { new: boolean }>;
 * // Result: { a: string; new: boolean; b?: never } | { b: string; new: boolean; a?: never }
 * ```
 */
export type DistributiveReplaceProperties<T, R> = T extends unknown
  ? Omit<T, keyof R> & R
  : never;

/**
 * Enforces mutual exclusion on a union type by adding `?: never` properties for discriminating keys
 * that don't exist in each variant.
 *
 * Given a union like `{ a: string } | { b: number }`, this will produce:
 * `{ a: string; b?: never } | { a?: never; b: number }`
 *
 * This makes TypeScript enforce that you can't pass `{ a: "x", b: 1 }` to a function expecting this union.
 * Without this, TypeScript allows excess properties when assigning to variables (not inline literals).
 *
 * @param T - The union type to make exclusive
 * @param Keys - Optional explicit list of discriminator keys. If not provided, uses all keys from all union members.
 *
 * @example
 * ```typescript
 * type Params = { query: string } | { filter: Filter };
 * type ExclusiveParams = ExclusiveUnion<Params>;
 * // Result: { query: string; filter?: never } | { query?: never; filter: Filter }
 *
 * const valid: ExclusiveParams = { query: "test" }; // ✓
 * const invalid: ExclusiveParams = { query: "test", filter: {...} }; // ✗ Type error
 * ```
 */
export type ExclusiveUnion<
  T,
  Keys extends PropertyKey = T extends unknown ? keyof T : never,
> = T extends unknown ? T & { [P in Exclude<Keys, keyof T>]?: never } : never;
