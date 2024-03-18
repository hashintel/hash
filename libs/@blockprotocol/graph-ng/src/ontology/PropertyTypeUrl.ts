import { ParseError } from "@effect/schema/ParseResult";
import * as S from "@effect/schema/Schema";
import { Brand, Either } from "effect";

import * as VersionedUrl from "../VersionedUrl.js";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyTypeUrl",
);
export type TypeId = typeof TypeId;

export const PropertyTypeUrl: S.Schema<PropertyTypeUrl, string> =
  VersionedUrl.VersionedUrl.pipe(S.brand(TypeId));

export type PropertyTypeUrl<T extends string = string> =
  VersionedUrl.VersionedUrl<T> & Brand.Brand<TypeId>;

export function parse<T extends string>(
  value: T,
): Either.Either<
  T extends VersionedUrl.Pattern<infer U>
    ? PropertyTypeUrl<U>
    : PropertyTypeUrl,
  ParseError
> {
  return S.decode(PropertyTypeUrl)(value) as never;
}

export function parseOrThrow<T extends string>(
  value: T,
): T extends VersionedUrl.Pattern<infer U>
  ? PropertyTypeUrl<U>
  : PropertyTypeUrl {
  return Either.getOrThrow(parse(value));
}
