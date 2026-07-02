/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The `Brand` module adds compile-time names to ordinary TypeScript values so
 * structurally identical values cannot be mixed accidentally. A branded value
 * has the same runtime representation as its unbranded value; the extra
 * information lives in the type system unless you choose a validating
 * constructor.
 *
 * Vendored from Effect-TS effect-smol (MIT).
 */

const TypeId = "~effect/Brand";

/**
 * Compile-time brand tag carried on a value so structurally identical primitives
 * cannot be mixed at the type level.
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
   * Strips every brand key from a branded type, leaving only the underlying
   * value type.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Unbranded<B extends Brand<any>> = B extends (infer U) & Brands<B>
    ? U
    : B;

  /**
   * Lists the string brand keys attached to a branded type.
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
   * Intersects the per-key brand tags of a multiply-branded type into one
   * brand object.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Brands<B extends Brand<any>> = UnionToIntersection<
    { [K in Keys<B>]: K extends string ? Brand<K> : never }[Keys<B>]
  >;
}

/**
 * Pairs a base value type with a single compile-time brand key.
 *
 * @category utility types
 * @since 2.0.0
 */
export type Branded<A, Key extends string> = A & Brand<Key>;

export const Branded =
  <B extends Brand<any>>() =>
  (value: Brand.Unbranded<B>): B =>
    // Identity at runtime; the brand exists only in the type system.
    value as B;
