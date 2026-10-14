import type * as Type from "../type/index.js";
import type { Normalize } from "./ExpressionType.js";
import type { Types } from "effect";

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- a closed expression requires no input names
export type Empty = Record<never, never>;

declare const ErasedRequirement: unique symbol;

/** Unrecoverable requirements cannot be discharged by a named input schema. */
export type Erased = { readonly [ErasedRequirement]: Type.Unknown };

type RequiredKeys<Inputs> = {
  [Key in keyof Inputs]-?: Empty extends Pick<Inputs, Key> ? never : Key;
}[keyof Inputs];

type At<Inputs, Key extends PropertyKey> = Key extends keyof Inputs
  ? Exclude<Inputs[Key], undefined>
  : never;

type Combined<Left, Right, Key extends PropertyKey> = Key extends keyof Left
  ? Key extends keyof Right
    ? At<Left, Key> extends infer LeftType extends Type.Any
      ? At<Right, Key> extends infer RightType extends Type.Any
        ? Normalize<Type.Intersection<readonly [LeftType, RightType]>>
        : never
      : never
    : At<Left, Key>
  : At<Right, Key>;

type Last<Alternatives> =
  Types.UnionToIntersection<
    Alternatives extends unknown ? () => Alternatives : never
  > extends () => infer Member
    ? Member
    : never;

// Invariance keeps a closed alternative from swallowing a narrower required record during Exclude.
type InvariantAlternatives<Requirements> = Requirements extends unknown
  ? (value: Requirements) => Requirements
  : never;

type Unwrap<Alternative> = Alternative extends (
  value: infer Requirements,
) => unknown
  ? Requirements
  : never;

type CollapseAlternatives<Alternatives, Accumulated = Empty> = [
  Alternatives,
] extends [never]
  ? Accumulated
  : [Alternatives] extends [Types.UnionToIntersection<Alternatives>]
    ? MergeRecords<Accumulated, Unwrap<Alternatives>>
    : CollapseAlternatives<
        Exclude<Alternatives, Last<Alternatives>>,
        MergeRecords<Accumulated, Unwrap<Last<Alternatives>>>
      >;

/** Requires every member of a host-side alternative, preserving shared semantic constraints. */
export type Conservative<Requirements> = [Requirements] extends [never]
  ? Erased
  : unknown extends Requirements
    ? Erased
    : CollapseAlternatives<InvariantAlternatives<Requirements>>;

/** A shared input must satisfy every use, including every host-side union alternative. */
export type Merge<Left, Right> = [keyof Conservative<Right>] extends [never]
  ? Left
  : typeof ErasedRequirement extends
        | keyof Conservative<Left>
        | keyof Conservative<Right>
    ? never
    : [keyof Conservative<Left>] extends [never]
      ? Conservative<Right>
      : MergeRecords<Conservative<Left>, Conservative<Right>>;

type MergeRecords<Left, Right> = [keyof Right] extends [never]
  ? Left
  : [keyof Left] extends [never]
    ? Right
    : Types.Simplify<
        {
          readonly [Key in RequiredKeys<Left> | RequiredKeys<Right>]: Combined<
            Left,
            Right,
            Key
          >;
        } & {
          readonly [Key in Exclude<
            keyof Left | keyof Right,
            RequiredKeys<Left> | RequiredKeys<Right>
          >]?: Combined<Left, Right, Key>;
        }
      >;

/** Combines every member of a tuple, or conservatively intersects an array's member requirements. */
// oxlint-disable-next-line typescript/no-restricted-types -- each member is an inferred input record
export type All<Members extends readonly unknown[]> = Members extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Merge<Head, All<Tail>>
  : number extends Members["length"]
    ? Conservative<Members[number]>
    : Empty;
