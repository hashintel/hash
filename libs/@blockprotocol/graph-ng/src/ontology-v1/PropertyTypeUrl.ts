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

export type PropertyTypeUrl<T extends string = string> =
  VersionedUrl.VersionedUrl<T> & Brand.Brand<TypeId>;

export function parseOrThrow<T extends string>(
  value: T,
): T extends VersionedUrl.Pattern<infer U>
  ? PropertyTypeUrl<U>
  : PropertyTypeUrl {
  return S.decodeSync(PropertyTypeUrl)(value) as never;
}
