import {
  Effect,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
  flow,
} from "effect";

import { compilePath } from "../../internal/type-compile.js";
import { parsePath } from "../../internal/type-parser.js";
import * as Ident from "../Ident.js";

import type * as Path from "../Path.js";

type TypeRef = Schema.suspend<Schema.Codec<Type, TypeEncoded>>;
const TypeRef: TypeRef = Schema.suspend(
  // oxlint-disable-next-line no-use-before-define -- recursive schema
  (): Schema.Codec<Type, TypeEncoded> => Type,
);

/** Recursive path arguments validate decoded types, not their schema-encoded objects. */
const DecodedTypeRef = Schema.toType(TypeRef);
export const PathArgument: Schema.Codec<Path.SegmentArgument> = Schema.Union([
  Schema.TaggedStruct("GenericArgument", { bound: DecodedTypeRef }),
  Schema.TaggedStruct("GenericConstraint", {
    name: Ident.SchemaFromSelf,
    bound: DecodedTypeRef,
  }),
]);

export const PathSegment: Schema.Struct<{
  name: typeof Ident.SchemaFromSelf;
  arguments: Schema.$Array<typeof PathArgument>;
}> = Schema.Struct({
  name: Ident.SchemaFromSelf,
  arguments: Schema.Array(PathArgument),
});

export const PathFromSelf: Schema.Struct<{
  rooted: Schema.Boolean;
  segments: Schema.NonEmptyArray<typeof PathSegment>;
}> = Schema.Struct({
  rooted: Schema.Boolean,
  segments: Schema.NonEmptyArray(PathSegment),
});

/** Path and type schemas share a definition module because each can contain the other. */
export const PathSchema: Schema.decodeTo<
  typeof PathFromSelf,
  typeof Schema.String
> = Schema.String.pipe(
  Schema.decodeTo(PathFromSelf, {
    decode: SchemaGetter.transformEffect(
      flow(
        parsePath,
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
    encode: SchemaGetter.transform(compilePath),
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
  // `+` and `` `+` `` decode to the same name, and a struct holds each name once.
  members: Schema.Array(Schema.Tuple([Ident.Schema, TypeRef])).check(
    Schema.isUniqueKey(),
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
/** The schema-encoded form of {@link Type}, with paths and names as source text. */
export type TypeEncoded =
  | UnionEncoded
  | IntersectionEncoded
  | StructEncoded
  | TupleEncoded
  | ReferenceEncoded
  | InferEncoded;
