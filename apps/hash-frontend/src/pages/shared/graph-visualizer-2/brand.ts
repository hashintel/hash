/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The `Brand` module adds compile-time names to ordinary TypeScript values so
 * structurally identical values cannot be mixed accidentally. A branded value
 * has the same runtime representation as its unbranded value; the extra
 * information lives in the type system unless you choose a validating
 * constructor.
 *
 * Extracted from https://github.com/Effect-TS/effect-smol/blob/5a0c1a4faee5707b5cc35e646ff1ffdad70f1956/packages/effect/src/Brand.ts#L35
 * MIT licensed.
 */

const TypeId = "~effect/Brand";

/**
 * A generic interface that defines a branded type.
 *
 * **When to use**
 *
 * Use to define a branded type such as `number & Brand<"Positive">` when
 * TypeScript should keep structurally identical values separate without
 * changing their runtime value.
 *
 * @see {@link Branded} for applying a brand key to a base type
 * @see {@link Constructor} for validating or constructing branded values
 *
 * @category models
 * @since 2.0.0
 */
export interface Brand<in out Keys extends string> {
  readonly [TypeId]: {
    readonly [K in Keys]: Keys;
  };
}

/**
 * Namespace containing type-level helpers for working with branded types and
 * brand constructors.
 *
 * @since 2.0.0
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Brand {
  /**
   * A utility type to extract the unbranded value type from a brand.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Unbranded<B extends Brand<any>> = B extends (infer U) & Brands<B>
    ? U
    : B;

  /**
   * A utility type to extract the keys of a branded type.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Keys<B extends Brand<any>> = keyof B[typeof TypeId];

  type UnionToIntersection<T> = (
    T extends any ? (x: T) => any : never
  ) extends (x: infer R) => any
    ? R
    : never;

  /**
   * A utility type to extract the brands from a branded type.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Brands<B extends Brand<any>> = UnionToIntersection<
    { [K in Keys<B>]: K extends string ? Brand<K> : never }[Keys<B>]
  >;
}

/**
 * A type alias for creating branded types more concisely.
 *
 * @category utility types
 * @since 2.0.0
 */
export type Branded<A, Key extends string> = A & Brand<Key>;

export const Branded =
  <B extends Brand<any>>() =>
  (value: Brand.Unbranded<B>): B =>
    value as B;
