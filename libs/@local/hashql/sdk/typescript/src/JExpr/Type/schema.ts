// oxlint-disable max-classes-per-file -- the path value classes and the type schema are mutually recursive through Schema.suspend
import {
  Array,
  Effect,
  Equal,
  Hash,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
  flow,
} from "effect";

import { compilePath } from "../../internal/type-compile.js";
import { makeGrammar } from "../../internal/type-parser.js";
import * as Ident from "../Ident.js";

import type { Pipeable } from "effect";

/** Carries recursive field-record inputs alongside the syntax codec. */
interface TypeCodec extends Schema.Codec<Type, TypeEncoded> {
  readonly Iso: TypeIso;
  readonly "~type.make.in": TypeIso;
  readonly "~type.make": TypeIso;
}

type TypeRef = Schema.suspend<TypeCodec>;
const TypeRef: TypeRef = Schema.suspend(
  // oxlint-disable-next-line no-use-before-define -- recursive schema
  (): TypeCodec => Type,
);

/**
 * Retains decoded names and constructs nested paths from their field records.
 * The type-side target preserves recursive constructor and Iso metadata after codec derivation.
 */
const DecodedTypeRef = Schema.toCodecIso(TypeRef).pipe(
  Schema.decodeTo(Schema.toType(TypeRef)),
);

/** Positional path argument with runtime equality over its nested type syntax. */
export class PathGenericArgument extends Schema.Class<
  PathGenericArgument,
  Pipeable.Pipeable
>("hashql/Path/GenericArgument")({
  _tag: Schema.tag("GenericArgument"),
  bound: DecodedTypeRef,
}) {
  [Equal.symbol](that: Equal.Equal): boolean {
    return (
      Schema.is(PathGenericArgument)(that) &&
      Equal.equals(this.bound, that.bound)
    );
  }

  [Hash.symbol](): number {
    return Hash.hash([this._tag, this.bound]);
  }
}

/** Named path constraint with runtime equality over its name and bound. */
export class PathGenericConstraint extends Schema.Class<
  PathGenericConstraint,
  Pipeable.Pipeable
>("hashql/Path/GenericConstraint")({
  _tag: Schema.tag("GenericConstraint"),
  name: Ident.SchemaFromSelf,
  bound: DecodedTypeRef,
}) {
  [Equal.symbol](that: Equal.Equal): boolean {
    return (
      Schema.is(PathGenericConstraint)(that) &&
      Equal.equals(this.name, that.name) &&
      Equal.equals(this.bound, that.bound)
    );
  }

  [Hash.symbol](): number {
    return Hash.hash([this._tag, this.name, this.bound]);
  }
}

/** Allows ordinary positional argument fields in enclosing schema constructors. */
interface PathGenericArgumentConstructor extends Omit<
  typeof PathGenericArgument,
  "~type.make"
> {
  readonly "~type.make": (typeof PathGenericArgument)["~type.make.in"];
}
const PathGenericArgumentConstructor: PathGenericArgumentConstructor =
  PathGenericArgument;

/** Allows ordinary named constraint fields in enclosing schema constructors. */
interface PathGenericConstraintConstructor extends Omit<
  typeof PathGenericConstraint,
  "~type.make"
> {
  readonly "~type.make": (typeof PathGenericConstraint)["~type.make.in"];
}
const PathGenericConstraintConstructor: PathGenericConstraintConstructor =
  PathGenericConstraint;

/** Validates either argument kind and constructs its corresponding value class. */
export const PathArgument = Schema.Union([
  PathGenericArgumentConstructor,
  PathGenericConstraintConstructor,
]);

/** Validates names and arguments before constructing a segment with Effect's `Equal`, `Hash` and `Pipeable` interfaces. */
export class PathSegment extends Schema.Class<PathSegment, Pipeable.Pipeable>(
  "hashql/Path/Segment",
)({
  name: Ident.SchemaFromSelf,
  arguments: Schema.Array(PathArgument),
}) {
  [Equal.symbol](that: Equal.Equal): boolean {
    return (
      Schema.is(PathSegment)(that) &&
      Equal.equals(this.name, that.name) &&
      Equal.equals(this.arguments, that.arguments)
    );
  }

  [Hash.symbol](): number {
    return Hash.hash([this.name, this.arguments]);
  }
}

/** Allows an ordinary segment input at a nested constructor boundary. */
interface PathSegmentConstructor extends Omit<
  typeof PathSegment,
  "~type.make"
> {
  readonly "~type.make": (typeof PathSegment)["~type.make.in"];
}
const PathSegmentConstructor: PathSegmentConstructor = PathSegment;

/** The shared path constructor used by parsing, schema decoding and internal producers. */
export class PathFromSelf extends Schema.Class<PathFromSelf, Pipeable.Pipeable>(
  "hashql/Path",
)({
  rooted: Schema.Boolean,
  segments: Schema.NonEmptyArray(PathSegmentConstructor),
}) {
  [Equal.symbol](that: Equal.Equal): boolean {
    return (
      Schema.is(PathFromSelf)(that) &&
      this.rooted === that.rooted &&
      Equal.equals(this.segments, that.segments)
    );
  }

  [Hash.symbol](): number {
    return Hash.hash([this.rooted, this.segments]);
  }
}

/** Retains ordinary path inputs in enclosing schema constructors. */
interface PathConstructor extends Omit<typeof PathFromSelf, "~type.make"> {
  readonly "~type.make": (typeof PathFromSelf)["~type.make.in"];
}
const PathConstructor: PathConstructor = PathFromSelf;

/** The grammar only calls these constructors when parsing or generating, after schema initialization. */
export const pathGrammar = makeGrammar({
  argument: (bound) => PathGenericArgument.make({ bound }),
  constraint: (name, bound) => PathGenericConstraint.make({ name, bound }),
  segment: (name, args) => PathSegment.make({ name, arguments: args }),
  path: (rooted, segments) => PathFromSelf.make({ rooted, segments }),
});

/** Path and type schemas share a definition module because each can contain the other. */
export const PathSchema: Schema.decodeTo<
  PathConstructor,
  typeof Schema.String
> = Schema.String.pipe(
  Schema.decodeTo(PathConstructor, {
    decode: SchemaGetter.transformEffect(
      flow(
        pathGrammar.parsePath,
        Result.mapError(
          (parserError) =>
            new SchemaIssue.InvalidValue({
              message: `Invalid path at UTF-16 offset ${parserError.offset}`,
              parserError,
            }),
        ),
        Effect.fromResult,
      ),
    ),
    encode: SchemaGetter.transform((input) =>
      compilePath(PathFromSelf.make(input)),
    ),
  }),
);

export const Union: Schema.TaggedStruct<
  "Union",
  { members: Schema.NonEmptyArray<TypeRef> }
> = Schema.TaggedStruct("Union", {
  members: Schema.NonEmptyArray(TypeRef),
});

/** Type syntax for a value of at least one member type, with annotation text `A | B`. */
export interface UnionType extends Schema.Schema.Type<typeof Union> {}
/** The schema-encoded form of {@link UnionType}, with nested paths and names as source text. */
export interface UnionEncoded extends Schema.Codec.Encoded<typeof Union> {}

export const Intersection: Schema.TaggedStruct<
  "Intersection",
  { members: Schema.NonEmptyArray<TypeRef> }
> = Schema.TaggedStruct("Intersection", {
  members: Schema.NonEmptyArray(TypeRef),
});

/** Type syntax for a value of every member type, with annotation text `A & B`. */
export interface IntersectionType extends Schema.Schema.Type<
  typeof Intersection
> {}
/** The schema-encoded form of {@link IntersectionType}, with nested paths and names as source text. */
export interface IntersectionEncoded extends Schema.Codec.Encoded<
  typeof Intersection
> {}

export const Struct: Schema.TaggedStruct<
  "Struct",
  {
    members: Schema.$Array<
      Schema.Tuple<readonly [typeof Ident.Schema, TypeRef]>
    >;
  }
> = Schema.TaggedStruct("Struct", {
  // A struct holds each name once, and two spellings of one name, such as `+` and `` `+` ``, repeat a field.
  members: Schema.Array(Schema.Tuple([Ident.Schema, TypeRef])).check(
    Schema.makeFilter(
      (members) =>
        Array.dedupe(Array.map(members, ([name]) => Ident.name(name)))
          .length === members.length,
      {
        expected: "fields with distinct names",
        arbitraryConstraint: {
          uniqueBy: ([name]: readonly [Ident.Ident, Type]) => Ident.name(name),
        },
      },
    ),
  ),
});

/** Type syntax for named fields, holding distinct decoded names and their types in order. Its annotation text is `(name: T)`, or `(:)` when empty. */
export interface StructType extends Schema.Schema.Type<typeof Struct> {}
/** The schema-encoded form of {@link StructType}, with field names, paths and nested names as source text. */
export interface StructEncoded extends Schema.Codec.Encoded<typeof Struct> {}

export const Tuple: Schema.TaggedStruct<
  "Tuple",
  { members: Schema.$Array<TypeRef> }
> = Schema.TaggedStruct("Tuple", {
  members: Schema.Array(TypeRef),
});

/** Type syntax for positional members, with annotation text `(A, B)`, `(A,)` or `()`. */
export interface TupleType extends Schema.Schema.Type<typeof Tuple> {}
/** The schema-encoded form of {@link TupleType}, with nested paths and names as source text. */
export interface TupleEncoded extends Schema.Codec.Encoded<typeof Tuple> {}

export const GenericArgument: Schema.TaggedStruct<
  "GenericArgument",
  { bound: TypeRef }
> = Schema.TaggedStruct("GenericArgument", {
  bound: TypeRef,
});

/** A positional generic argument, such as the `Integer` in `List<Integer>`. */
export interface GenericArgumentType extends Schema.Schema.Type<
  typeof GenericArgument
> {}
/** The schema-encoded form of {@link GenericArgumentType}, with nested paths and names as source text. */
export interface GenericArgumentEncoded extends Schema.Codec.Encoded<
  typeof GenericArgument
> {}

export const GenericBound: Schema.TaggedStruct<
  "GenericBound",
  {
    name: typeof Ident.Schema;
    bound: Schema.optionalKey<TypeRef>;
  }
> = Schema.TaggedStruct("GenericBound", {
  name: Ident.Schema,
  bound: TypeRef.pipe(Schema.optionalKey),
});

/** A named generic parameter with an optional bound, such as the `T: Integer` in `List<T: Integer>`. */
export interface GenericBoundType extends Schema.Schema.Type<
  typeof GenericBound
> {}
/** The schema-encoded form of {@link GenericBoundType}, with its name, paths and nested names as source text. */
export interface GenericBoundEncoded extends Schema.Codec.Encoded<
  typeof GenericBound
> {}

export const Generic: Schema.toTaggedUnion<
  "_tag",
  readonly [typeof GenericArgument, typeof GenericBound]
> = Schema.Union([GenericArgument, GenericBound]).pipe(
  Schema.toTaggedUnion("_tag"),
);
/** A positional argument or named bound supplied to the reference builder. */
export type GenericType = (typeof Generic)["Type"];
/** The schema-encoded form of {@link GenericType}. */
export type GenericEncoded = (typeof Generic)["Encoded"];

export const Reference: Schema.TaggedStruct<
  "Reference",
  { path: typeof PathSchema }
> = Schema.TaggedStruct("Reference", {
  path: PathSchema,
});

/** A placeholder for a type the HashQL compiler infers. */
export const Infer: Schema.Struct<{ _tag: Schema.tag<"Infer"> }> =
  Schema.Struct({ _tag: Schema.tag("Infer") });

/** The decoded inference placeholder. */
export interface InferType extends Schema.Schema.Type<typeof Infer> {}

/** The schema-encoded inference placeholder. */
export interface InferEncoded extends Schema.Codec.Encoded<typeof Infer> {}

/** Type syntax naming a type by its decoded path, with ordered generic entries on each segment. */
export interface ReferenceType extends Schema.Schema.Type<typeof Reference> {}
/** The schema-encoded form of {@link ReferenceType}, with its path and nested names as source text. */
export interface ReferenceEncoded extends Schema.Codec.Encoded<
  typeof Reference
> {}

export const Type: Schema.toTaggedUnion<
  "_tag",
  readonly [
    typeof Union,
    typeof Intersection,
    typeof Struct,
    typeof Tuple,
    typeof Reference,
    typeof Infer,
  ]
> = Schema.Union([Union, Intersection, Struct, Tuple, Reference, Infer]).pipe(
  Schema.toTaggedUnion("_tag"),
);

/** Tagged type syntax: a union, intersection, struct, tuple, reference or inference placeholder. */
export type Type =
  | UnionType
  | IntersectionType
  | StructType
  | TupleType
  | ReferenceType
  | InferType;

/** Union field records with recursive ordinary member inputs. */
interface UnionIso extends Schema.Struct.Iso<typeof Union.fields> {}

/** Intersection field records with recursive ordinary member inputs. */
interface IntersectionIso extends Schema.Struct.Iso<
  typeof Intersection.fields
> {}

/** Struct field records retaining decoded identifiers. */
interface StructIso extends Schema.Struct.Iso<typeof Struct.fields> {}

/** Tuple field records with recursive ordinary member inputs. */
interface TupleIso extends Schema.Struct.Iso<typeof Tuple.fields> {}

/** Reference field records whose path does not require runtime protocols. */
interface ReferenceIso extends Omit<ReferenceType, "path"> {
  readonly path: (typeof PathFromSelf)["Encoded"];
}
/** Field-record representation used by decoded path arguments and constructors. */
type TypeIso =
  | UnionIso
  | IntersectionIso
  | StructIso
  | TupleIso
  | ReferenceIso
  | InferType;

/** The schema-encoded form of {@link Type}, with paths and names as source text. */
export type TypeEncoded =
  | UnionEncoded
  | IntersectionEncoded
  | StructEncoded
  | TupleEncoded
  | ReferenceEncoded
  | InferEncoded;
