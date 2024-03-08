import * as S from "@effect/schema/Schema";
import { Brand } from "effect";

import * as BaseUrl from "../BaseUrl";
import * as VersionedUrl from "../VersionedUrl";
import { Pattern } from "../VersionedUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyTypeUrl",
);
export type TypeId = typeof TypeId;

export const PropertyTypeUrl: S.Schema<PropertyTypeUrl, string> =
  VersionedUrl.VersionedUrl.pipe(S.brand(TypeId));

export type PropertyTypeUrl<T extends BaseUrl.BaseUrl = BaseUrl.BaseUrl> =
  VersionedUrl.VersionedUrl<T> & Brand.Brand<TypeId>;

export function parseOrThrow<T extends string>(
  value: T,
): T extends VersionedUrl.Pattern<infer U>
  ? PropertyTypeUrl<U & Brand.Brand<BaseUrl.TypeId>>
  : PropertyTypeUrl {
  return S.decodeSync(PropertyTypeUrl)(value) as never;
}

type UnbrandedBase<T> = T extends VersionedUrl.Pattern<infer U> ? U : never;
export type Base<T> = UnbrandedBase<Brand.Brand.Unbranded<T>>;
export function base<T extends VersionedUrl.VersionedUrl>(value: T): Base<T> {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(Pattern)!;

  // again, value is guaranteed to be a string, because `Schema` guarantees a well-formed value.
  return match[1] as never;
}
