import * as S from "@effect/schema/Schema";
import { Brand, Either } from "effect";

import * as VersionedUrl from "../VersionedUrl.js";
import { ParseError } from "@effect/schema/ParseResult";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataTypeUrl",
);
export type TypeId = typeof TypeId;

export const DataTypeUrl: S.Schema<DataTypeUrl, string> =
  VersionedUrl.VersionedUrl.pipe(S.brand(TypeId));

export type DataTypeUrl<T extends string = string> =
  VersionedUrl.VersionedUrl<T> & Brand.Brand<TypeId>;

export function parse<T extends string>(
  value: T,
): Either.Either<
  T extends VersionedUrl.Pattern<infer U> ? DataTypeUrl<U> : DataTypeUrl,
  ParseError
> {
  return S.decode(DataTypeUrl)(value) as never;
}

export function parseOrThrow<T extends string>(
  value: T,
): T extends VersionedUrl.Pattern<infer U> ? DataTypeUrl<U> : DataTypeUrl {
  return Either.getOrThrow(parse(value));
}
