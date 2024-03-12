import * as S from "@effect/schema/Schema";
import { Brand } from "effect";

import * as BaseUrl from "../BaseUrl";
import * as VersionedUrl from "../VersionedUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataTypeUrl",
);
export type TypeId = typeof TypeId;

export const DataTypeUrl: S.Schema<DataTypeUrl, string> =
  VersionedUrl.VersionedUrl.pipe(S.brand(TypeId));

export type DataTypeUrl<T extends string = string> =
  VersionedUrl.VersionedUrl<T> & Brand.Brand<TypeId>;

export function parseOrThrow<T extends string>(
  value: T,
): T extends VersionedUrl.Pattern<infer U>
  ? DataTypeUrl<U & Brand.Brand<BaseUrl.TypeId>>
  : DataTypeUrl {
  return S.decodeSync(DataTypeUrl)(value) as never;
}
