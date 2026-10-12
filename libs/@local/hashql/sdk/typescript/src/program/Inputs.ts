import type * as Type from "../type/index.js";
import type { Normalize } from "./ExpressionType.js";
import type { Types } from "effect";

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- a closed expression requires no input names
export type Empty = Record<never, never>;

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

/** A shared input must satisfy every use. One required use makes it required. */
export type Merge<Left, Right> = [keyof Right] extends [never]
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
    ? Types.UnionToIntersection<Members[number]>
    : Empty;
