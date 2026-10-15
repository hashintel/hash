import { Schema } from "effect";

import * as Ident from "../Ident.js";
import * as Path from "../Path.js";

type TypeRef = Schema.suspend<Schema.Codec<Type, TypeEncoded>>;
const TypeRef: TypeRef = Schema.suspend(
  // oxlint-disable-next-line no-use-before-define -- recursive schema
  (): Schema.Codec<Type, TypeEncoded> => Type,
);

export const Union: Schema.TaggedStruct<
  "Union",
  { members: Schema.NonEmptyArray<TypeRef> }
> = Schema.TaggedStruct("Union", {
  members: Schema.NonEmptyArray(TypeRef),
});

/** Type syntax for a value of at least one member type, with annotation text `(A | B)`. */
export interface UnionType extends Schema.Schema.Type<typeof Union> {}
/** The schema-encoded form of {@link UnionType}, with nested paths and names as source text. */
export interface UnionEncoded extends Schema.Codec.Encoded<typeof Union> {}

export const Intersection: Schema.TaggedStruct<
  "Intersection",
  { members: Schema.NonEmptyArray<TypeRef> }
> = Schema.TaggedStruct("Intersection", {
  members: Schema.NonEmptyArray(TypeRef),
});

/** Type syntax for a value of every member type, with annotation text `(A & B)`. */
export interface IntersectionType extends Schema.Schema.Type<
  typeof Intersection
> {}
/** The schema-encoded form of {@link IntersectionType}, with nested paths and names as source text. */
export interface IntersectionEncoded extends Schema.Codec.Encoded<
  typeof Intersection
> {}

export const Struct: Schema.TaggedStruct<
  "Struct",
  { members: Schema.$Array<Schema.Tuple<[typeof Ident.Schema, TypeRef]>> }
> = Schema.TaggedStruct("Struct", {
  members: Schema.Array(Schema.Tuple([Ident.Schema, TypeRef])),
});

/** Type syntax for named fields, holding decoded name and type pairs in order. Its annotation text is `(name: T)`, or `(:)` when empty. */
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
/** An entry in a reference's generic list: a positional argument or a named bound. */
export type GenericType = (typeof Generic)["Type"];
/** The schema-encoded form of {@link GenericType}. */
export type GenericEncoded = (typeof Generic)["Encoded"];

export const Reference: Schema.TaggedStruct<
  "Reference",
  { path: typeof Path.Schema; generics: Schema.$Array<typeof Generic> }
> = Schema.TaggedStruct("Reference", {
  path: Path.Schema,
  generics: Schema.Array(Generic),
});

/** Type syntax naming a type by its decoded path, with its generic entries in order. */
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
  ]
> = Schema.Union([Union, Intersection, Struct, Tuple, Reference]).pipe(
  Schema.toTaggedUnion("_tag"),
);

/** Tagged type syntax: a union, intersection, struct, tuple or reference. */
export type Type =
  | UnionType
  | IntersectionType
  | StructType
  | TupleType
  | ReferenceType;
/** The schema-encoded form of {@link Type}, with paths and names as source text. */
export type TypeEncoded =
  | UnionEncoded
  | IntersectionEncoded
  | StructEncoded
  | TupleEncoded
  | ReferenceEncoded;
