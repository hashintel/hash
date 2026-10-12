import { Schema } from "effect";

import * as Ident from "../Ident.js";
import * as Path from "../Path.js";

// oxlint-disable-next-line no-redeclare -- `TypeRefType` is a bit silly
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

export interface UnionType extends Schema.Schema.Type<typeof Union> {}
export interface UnionEncoded extends Schema.Codec.Encoded<typeof Union> {}

export const Intersection: Schema.TaggedStruct<
  "Intersection",
  { members: Schema.NonEmptyArray<TypeRef> }
> = Schema.TaggedStruct("Intersection", {
  members: Schema.NonEmptyArray(TypeRef),
});

export interface IntersectionType extends Schema.Schema.Type<
  typeof Intersection
> {}
export interface IntersectionEncoded extends Schema.Codec.Encoded<
  typeof Intersection
> {}

export const Struct: Schema.TaggedStruct<
  "Struct",
  { members: Schema.$Array<Schema.Tuple<[typeof Ident.Schema, TypeRef]>> }
> = Schema.TaggedStruct("Struct", {
  members: Schema.Array(Schema.Tuple([Ident.Schema, TypeRef])),
});

export interface StructType extends Schema.Schema.Type<typeof Struct> {}
export interface StructEncoded extends Schema.Codec.Encoded<typeof Struct> {}

export const Tuple: Schema.TaggedStruct<
  "Tuple",
  { members: Schema.$Array<TypeRef> }
> = Schema.TaggedStruct("Tuple", {
  members: Schema.Array(TypeRef),
});

export interface TupleType extends Schema.Schema.Type<typeof Tuple> {}
export interface TupleEncoded extends Schema.Codec.Encoded<typeof Tuple> {}

export const GenericArgument: Schema.TaggedStruct<
  "GenericArgument",
  { bound: TypeRef }
> = Schema.TaggedStruct("GenericArgument", {
  bound: TypeRef,
});

export interface GenericArgumentType extends Schema.Schema.Type<
  typeof GenericArgument
> {}
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

export interface GenericBoundType extends Schema.Schema.Type<
  typeof GenericBound
> {}
export interface GenericBoundEncoded extends Schema.Codec.Encoded<
  typeof GenericBound
> {}

export const Generic: Schema.toTaggedUnion<
  "_tag",
  readonly [typeof GenericArgument, typeof GenericBound]
> = Schema.Union([GenericArgument, GenericBound]).pipe(
  Schema.toTaggedUnion("_tag"),
);
export type GenericType = (typeof Generic)["Type"];
export type GenericEncoded = (typeof Generic)["Encoded"];

export const Reference: Schema.TaggedStruct<
  "Reference",
  { path: typeof Path.Schema; generics: Schema.$Array<typeof Generic> }
> = Schema.TaggedStruct("Reference", {
  path: Path.Schema,
  generics: Schema.Array(Generic),
});

export interface ReferenceType extends Schema.Schema.Type<typeof Reference> {}
export interface ReferenceEncoded extends Schema.Codec.Encoded<
  typeof Reference
> {}

// oxlint-disable-next-line no-redeclare -- `TypeType` is a bit silly
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

export type Type =
  | UnionType
  | IntersectionType
  | StructType
  | TupleType
  | ReferenceType;
export type TypeEncoded =
  | UnionEncoded
  | IntersectionEncoded
  | StructEncoded
  | TupleEncoded
  | ReferenceEncoded;
