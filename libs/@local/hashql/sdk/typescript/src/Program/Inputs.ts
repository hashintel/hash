/**
 * Input requirements carried by expressions and programs.
 *
 * A required use makes a name required even when another use has a default. Uses of one name combine their descriptors as a {@link Type.Intersection}. Different primitives combine to {@link Type.Never}, apart from Integer and Number, which stay an intersection. Any other conflict stays an intersection, such as an opaque type with its underlying primitive, even where HashQL finds no common value.
 *
 * Host-side alternatives retain every possible requirement. The types here cannot know which expression the host will select. An empty alternative therefore must not hide a branch that needs an input.
 *
 * @module
 */
import type * as Type from "../Type.js";
import type { Normalize } from "./ExpressionType.js";
import type { Types } from "effect";

/** The requirement record of an expression that needs no inputs. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- a closed expression requires no input names
export type Empty = Record<never, never>;

declare const ErasedRequirement: unique symbol;

/**
 * Marks input requirements that TypeScript could not recover.
 *
 * Requirement inference produces this marker when an expression's requirement record is `never` or `unknown`, or when a value lacks the SDK's requirement metadata. No input schema has the marker key, so a program's input schema cannot satisfy an erased requirement. Merging it with a named requirement gives `never`.
 */
export interface Erased {
  readonly [ErasedRequirement]: Type.Unknown;
}

type RequiredKeys<I> = {
  [K in keyof I]-?: Empty extends Pick<I, K> ? never : K;
}[keyof I];

type At<I, K extends PropertyKey> = K extends keyof I
  ? Exclude<I[K], undefined>
  : never;

type Combined<L, R, K extends PropertyKey> = K extends keyof L
  ? K extends keyof R
    ? At<L, K> extends infer A extends Type.Any
      ? At<R, K> extends infer B extends Type.Any
        ? Normalize<Type.Intersection<readonly [A, B]>>
        : never
      : never
    : At<L, K>
  : At<R, K>;

type MergeRecords<L, R> = [keyof R] extends [never]
  ? L
  : [keyof L] extends [never]
    ? R
    : Types.Simplify<
        {
          readonly [K in RequiredKeys<L> | RequiredKeys<R>]: Combined<L, R, K>;
        } & {
          readonly [
            K in Exclude<keyof L | keyof R, RequiredKeys<L> | RequiredKeys<R>>
          ]?: Combined<L, R, K>;
        }
      >;

// Intersecting call signatures selects one union member through the last overload. Each step removes whichever member inference selects.
type Last<U> = Types.Covariant.Type<
  Types.UnionToIntersection<U extends U ? Types.Covariant<U> : never>
>;

// Records differing only by optional fields can be mutually assignable. Tag their key sets invariantly so union detection and member removal still distinguish them.
type Alternatives<I> = I extends I
  ? Types.Invariant<I> & { readonly keys: Types.Invariant<keyof I> }
  : never;

type Collapse<U, I> = [U] extends [never]
  ? I
  : Types.IsUnion<U> extends false
    ? MergeRecords<I, Types.Invariant.Type<U>>
    : Collapse<
        Exclude<U, Last<U>>,
        MergeRecords<I, Types.Invariant.Type<Last<U>>>
      >;

/**
 * Requires every host-side alternative, preserving shared semantic constraints.
 *
 * A union of requirement records becomes one record that requires each name any alternative requires. `never` and `unknown` become {@link Erased}.
 */
export type Conservative<I> = [I] extends [never]
  ? Erased
  : // oxlint-disable-next-line typescript/no-restricted-types -- this type-level check detects erased metadata rather than storing a runtime value
    unknown extends I
    ? Erased
    : Collapse<Alternatives<I>, Empty>;

type MergeConservative<L, R> = typeof ErasedRequirement extends
  | keyof L
  | keyof R
  ? never
  : MergeRecords<L, R>;

// An input-independent builder step preserves its unresolved left type parameter. Normalizing it again would change the step's generic result type.
type MergeRight<L, R> = [keyof R] extends [never]
  ? L
  : MergeConservative<Conservative<L>, R>;

/**
 * Combines shared requirements, preserving the left type when the right side needs no inputs.
 *
 * A name stays optional in the result only when every side that mentions it marks it optional. Where both sides mention a name, the result takes the intersection of its descriptors.
 *
 * @example <caption>Type-only: combine a defaulted use with a required use.</caption>
 * ```ts
 * import type { Program, Type } from "@local/hashql";
 *
 * type Equal<A, B> =
 *   (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
 *     ? true
 *     : false;
 *
 * export const requiredWins: Equal<
 *   Program.Inputs.Merge<
 *     { readonly limit?: Type.PrimitiveInteger },
 *     {
 *       readonly limit: Type.PrimitiveInteger;
 *       readonly name: Type.PrimitiveString;
 *     }
 *   >,
 *   {
 *     readonly limit: Type.PrimitiveInteger;
 *     readonly name: Type.PrimitiveString;
 *   }
 * > = true;
 * export const conflictIsNever: Equal<
 *   Program.Inputs.Merge<
 *     { readonly id: Type.PrimitiveInteger },
 *     { readonly id: Type.PrimitiveString }
 *   >,
 *   { readonly id: Type.Never }
 * > = true;
 * ```
 */
export type Merge<L, R> = MergeRight<L, Conservative<R>>;

/** Combines tuple members, retaining every possible requirement in arrays and optional positions. */
// oxlint-disable-next-line typescript/no-restricted-types -- inferred metadata includes unknown and never; Conservative detects erasure instead of assuming a valid input record
export type All<T extends readonly unknown[]> = T extends readonly []
  ? Empty
  : T extends readonly [infer H, ...infer R]
    ? Merge<H, All<R>>
    : Conservative<T[number]>;
