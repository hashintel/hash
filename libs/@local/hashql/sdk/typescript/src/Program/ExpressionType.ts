/**
 * Type-level normalization, calls and projections for symbolic values.
 *
 * Union projections require the field in every alternative. Intersections combine field descriptors. Index access includes {@link Type.PrimitiveNull} for an absent element. These calculations retain the source expression's input requirements.
 *
 * @module
 */
import type * as Type from "../Type.js";
import type * as Expression from "./Expression.js";
import type * as Input from "./Inputs.js";

type Composition = "Union" | "Intersection";
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- the empty intersection contributes no accessor members
type EmptyAccessors = Record<never, never>;

type Same<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

type Includes<
  Members extends readonly Type.Any[],
  Member extends Type.Any,
> = Members extends readonly [
  infer Head extends Type.Any,
  ...infer Tail extends readonly Type.Any[],
]
  ? Same<Head, Member> extends true
    ? true
    : Includes<Tail, Member>
  : false;

type Unique<
  Members extends readonly Type.Any[],
  Result extends readonly Type.Any[],
> = number extends Members["length"]
  ? Members
  : Members extends readonly [
        infer Head extends Type.Any,
        ...infer Tail extends readonly Type.Any[],
      ]
    ? Includes<Result, Head> extends true
      ? Unique<Tail, Result>
      : Unique<Tail, readonly [...Result, Head]>
    : Result;

type MembersOf<T extends Type.Any, Kind extends Composition> = T extends {
  readonly _tag: Kind;
  readonly types: infer Members extends readonly Type.Any[];
}
  ? Members
  : readonly [T];

type Compose<
  Kind extends Composition,
  Members extends readonly Type.Any[],
> = Members extends readonly []
  ? Kind extends "Union"
    ? Type.Never
    : Type.Unknown
  : Members extends readonly [infer Member extends Type.Any]
    ? Member
    : Kind extends "Union"
      ? Type.Union<Members>
      : Type.Intersection<Members>;

type Join<
  Left extends Type.Any,
  Right extends Type.Any,
> = Left extends Type.Never
  ? Right
  : Right extends Type.Never
    ? Left
    : Left extends Type.Unknown
      ? Type.Unknown
      : Right extends Type.Unknown
        ? Type.Unknown
        : Compose<
            "Union",
            Unique<
              readonly [
                ...MembersOf<Left, "Union">,
                ...MembersOf<Right, "Union">,
              ],
              readonly []
            >
          >;

type PrimitiveConflict<Left extends Type.Any, Right extends Type.Any> =
  Left extends Type.Intersection<infer Members>
    ? true extends {
        [Index in keyof Members]: PrimitiveConflict<Members[Index], Right>;
      }[number]
      ? true
      : false
    : Right extends Type.Intersection<infer Members>
      ? true extends {
          [Index in keyof Members]: PrimitiveConflict<Left, Members[Index]>;
        }[number]
        ? true
        : false
      : Left extends Type.Primitive
        ? Right extends Type.Primitive
          ? [Left | Right] extends [
              Type.PrimitiveInteger | Type.PrimitiveNumber,
            ]
            ? false
            : Same<Left["_tag"], Right["_tag"]> extends true
              ? false
              : true
          : false
        : false;

type MeetMembers<
  Members extends readonly Type.Any[],
  Other extends Type.Any,
> = {
  readonly [Index in keyof Members]: Meet<Members[Index], Other>;
};

type Meet<
  Left extends Type.Any,
  Right extends Type.Any,
> = Left extends Type.Never
  ? Type.Never
  : Right extends Type.Never
    ? Type.Never
    : Left extends Type.Unknown
      ? Right
      : Right extends Type.Unknown
        ? Left
        : Same<Left, Right> extends true
          ? Left
          : Left extends Type.Union<infer Members>
            ? Reduce<"Union", MeetMembers<Members, Right>, Type.Never>
            : Right extends Type.Union<infer Members>
              ? Reduce<"Union", MeetMembers<Members, Left>, Type.Never>
              : PrimitiveConflict<Left, Right> extends true
                ? Type.Never
                : Compose<
                    "Intersection",
                    Unique<
                      readonly [
                        ...MembersOf<Left, "Intersection">,
                        ...MembersOf<Right, "Intersection">,
                      ],
                      readonly []
                    >
                  >;

type Reduce<
  Kind extends Composition,
  Members extends readonly Type.Any[],
  Result extends Type.Any,
> = number extends Members["length"]
  ? Kind extends "Union"
    ? Type.Union<Members>
    : Type.Intersection<Members>
  : Members extends readonly [
        infer Head extends Type.Any,
        ...infer Tail extends readonly Type.Any[],
      ]
    ? Reduce<
        Kind,
        Tail,
        Kind extends "Union"
          ? Join<Result, Normalize<Head>>
          : Meet<Result, Normalize<Head>>
      >
    : Result;

/** Simplifies explicit unions and intersections without widening the parent expression's type. */
export type Normalize<T extends Type.Any> = [T] extends [never]
  ? Type.Never
  : [T] extends [Type.Union<infer Members>]
    ? Reduce<"Union", Members, Type.Never>
    : [T] extends [Type.Intersection<infer Members>]
      ? Reduce<"Intersection", Members, Type.Unknown>
      : T;

type Combine<
  Kind extends Composition,
  Members extends readonly Type.Any[],
> = Reduce<Kind, Members, Kind extends "Union" ? Type.Never : Type.Unknown>;

type FieldMaps<Members extends readonly Type.Any[]> = {
  readonly [Index in keyof Members]: FieldsOf<Normalize<Members[Index]>>;
};

type ProjectMembers<
  Members extends readonly Type.Any[],
  Key extends PropertyKey,
> = {
  readonly [Index in keyof Members]: Key extends keyof FieldsOf<
    Normalize<Members[Index]>
  >
    ? FieldsOf<Normalize<Members[Index]>>[Key] extends infer Field extends
        Type.Any
      ? Field
      : never
    : never;
};

/** A projection is available only when every member supports it. */
type CombinedFields<
  Kind extends Composition,
  Members extends readonly Type.Any[],
> = Members extends readonly []
  ? EmptyAccessors
  : {
      readonly [Key in keyof FieldMaps<Members>[number]]: Combine<
        Kind,
        ProjectMembers<Members, Key>
      >;
    };

type FieldsOf<T extends Type.Any> = [T] extends [Type.Struct<infer Fields>]
  ? {
      readonly [Field in Extract<keyof Fields, string | number>]: Fields[Field];
    }
  : [T] extends [Type.Tuple.Any]
    ? {
        readonly [
          Index in Extract<
            keyof T["fields"],
            `${number}`
          > as Index extends `${infer Position extends number}`
            ? Position
            : never
        ]: T["fields"][Index];
      }
    : [T] extends [Type.Opaque<string | symbol, infer Inner>]
      ? FieldsOf<Normalize<Inner>>
      : [T] extends [Type.Union<infer Members>]
        ? CombinedFields<"Union", Members>
        : [T] extends [Type.Intersection<infer Members>]
          ? CombinedFields<"Intersection", Members>
          : EmptyAccessors;

interface IndexDescriptor {
  readonly key: Type.Any;
  readonly value: Type.Any;
}

type IndexValues<Members extends readonly Type.Any[]> = {
  readonly [Index in keyof Members]: IndexOf<
    Normalize<Members[Index]>
  > extends infer Descriptor extends IndexDescriptor
    ? Descriptor["value"]
    : never;
};

type IndexFailures<
  Members extends readonly Type.Any[],
  Key extends Type.Any,
> = {
  readonly [Index in keyof Members]: IndexOf<
    Normalize<Members[Index]>
  > extends infer Descriptor
    ? [Descriptor] extends [IndexDescriptor]
      ? Same<Descriptor["key"], Key> extends true
        ? never
        : Index
      : Index
    : Index;
}[number];

type CombinedIndex<
  Kind extends Composition,
  Members extends readonly Type.Any[],
> = Members extends readonly [
  infer Head extends Type.Any,
  ...(readonly Type.Any[]),
]
  ? IndexOf<Normalize<Head>> extends infer Descriptor
    ? [Descriptor] extends [IndexDescriptor]
      ? [IndexFailures<Members, Descriptor["key"]>] extends [never]
        ? {
            readonly key: Descriptor["key"];
            readonly value: Combine<Kind, IndexValues<Members>>;
          }
        : undefined
      : undefined
    : undefined
  : undefined;

type IndexOf<T extends Type.Any> = [T] extends [Type.List<infer Value>]
  ? { readonly key: Type.PrimitiveInteger; readonly value: Value }
  : [T] extends [Type.Dict<infer Key, infer Value>]
    ? { readonly key: Key; readonly value: Value }
    : [T] extends [Type.Opaque<string | symbol, infer Inner>]
      ? IndexOf<Normalize<Inner>>
      : [T] extends [Type.Union<infer Members>]
        ? CombinedIndex<"Union", Members>
        : [T] extends [Type.Intersection<infer Members>]
          ? CombinedIndex<"Intersection", Members>
          : undefined;

/** Access operations whose validity the HashQL compiler decides. */
interface UnsafeAccessors<Inputs> {
  /**
   * Projects without checking the field or tuple position against the descriptor.
   *
   * The result has the {@link Type.Unknown} descriptor and retains the receiver's input requirements. This does not establish that the field or position exists. A position that is not an integer, such as `1.5` or `NaN`, stores an `InvalidExpression` construction failure.
   */
  readonly $projectUnsafe: (
    key: string | number,
  ) => Expression.Expression<Type.Unknown, Inputs>;

  /**
   * Indexes without constraining the receiver or key to their declared descriptors.
   *
   * The result has the {@link Type.Unknown} descriptor and combines the receiver's and key's input requirements. Existing construction failures still propagate, but the HashQL compiler must determine whether the lookup is valid.
   */
  readonly $indexUnsafe: <const Key extends Expression.Value.Any>(
    key: Key,
  ) => Expression.Expression<
    Type.Unknown,
    Input.Merge<Inputs, Expression.Value.Inputs<Key>>
  >;
}

type ProjectionAccessors<Fields, Inputs> = {
  readonly [
    Key in Exclude<
      keyof Fields,
      | keyof Expression.Expression.Handle<Type.Any, Inputs>
      | keyof UnsafeAccessors<Inputs>
      | "$project"
      | "$index"
    >
  ]: Fields[Key] extends infer Field extends Type.Any
    ? Expression.Expression<Normalize<Field>, Inputs>
    : never;
} & ([keyof Fields] extends [never]
  ? EmptyAccessors
  : {
      readonly $project: <Key extends keyof Fields>(
        key: Key,
      ) => Fields[Key] extends infer Field extends Type.Any
        ? Expression.Expression<Normalize<Field>, Inputs>
        : never;
    });

type IndexAccessor<Descriptor, Inputs> = [Descriptor] extends [IndexDescriptor]
  ? {
      readonly $index: <const Key extends Expression.Value<Descriptor["key"]>>(
        key: Key,
      ) => Expression.Expression<
        Join<Normalize<Descriptor["value"]>, Type.PrimitiveNull>,
        Input.Merge<Inputs, Expression.Value.Inputs<Key>>
      >;
    }
  : EmptyAccessors;

/**
 * Projection and indexing operations selected by an expression's semantic descriptor.
 *
 * Struct fields and tuple positions support property access and `$project`. For unions and intersections, a projected field must exist in every member. `$project` also accepts operation names such as `$index` when they name actual fields. List and dictionary `$index` calls merge the key's inputs. Their result includes {@link Type.PrimitiveNull} for an absent element. Opaque descriptors expose the operations of their underlying type.
 */
export type Accessors<T extends Type.Any, Inputs> = UnsafeAccessors<Inputs> &
  ProjectionAccessors<FieldsOf<Normalize<T>>, Inputs> &
  IndexAccessor<IndexOf<Normalize<T>>, Inputs>;

/** Host arguments accepted at each semantic parameter position, including corresponding primitive shorthand. */
export type Arguments<Parameters extends readonly Type.Any[]> = {
  readonly [Index in keyof Parameters]: Expression.Value<Parameters[Index]>;
};

export declare namespace Arguments {
  /** Positional expressions or host literals without a fixed parameter signature. */
  export type Any = readonly Expression.Value.Any[];

  /** Combined input requirements of a call's argument tuple, retaining requirements from optional positions. */
  export type Inputs<Values extends Any> = Input.All<{
    readonly [Index in keyof Values]: Expression.Value.Inputs<Values[Index]>;
  }>;

  /** Semantic descriptors at each argument position. */
  export type Types<Values extends Any> = {
    readonly [Index in keyof Values]: Expression.Value.Type<Values[Index]>;
  };
}

/**
 * Host call signatures that construct calls to fixed or generic HashQL functions.
 *
 * Fixed signatures constrain each argument by its declared descriptor. Generic signatures apply the argument descriptors to the declared type-level function. Both forms merge the callee's input requirements with those of every argument. Non-function descriptors contribute no call signature.
 */
export type Callable<T extends Type.Any, Inputs> =
  T extends Type.Function<infer Parameters, infer Returns>
    ? <const Values extends Arguments<Parameters>>(
        ...args: Values
      ) => Expression.Expression<
        Returns,
        Input.Merge<Inputs, Arguments.Inputs<Values>>
      >
    : T extends Type.GenericFunction<infer Signature>
      ? <const Values extends Arguments.Any>(
          ...args: Values &
            Arguments<
              Type.TypeLambda.Apply<
                Signature,
                Arguments.Types<Values>
              >["parameters"]
            >
        ) => Expression.Expression<
          Type.TypeLambda.Apply<Signature, Arguments.Types<Values>>["returns"],
          Input.Merge<Inputs, Arguments.Inputs<Values>>
        >
      : EmptyAccessors;

/** The normalized union of two conditional branch descriptors, retaining a single descriptor when both are equal. */
export type Conditional<Then extends Type.Any, Else extends Type.Any> = Join<
  Normalize<Then>,
  Normalize<Else>
>;
