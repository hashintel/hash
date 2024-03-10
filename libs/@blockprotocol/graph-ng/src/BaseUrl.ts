import * as S from "@effect/schema/Schema";
import { Brand } from "effect";

import * as Url from "./internal/Url";

const TypeId: unique symbol = Symbol.for("@blockprotocol/graph/BaseUrl");
export type TypeId = typeof TypeId;

export type BaseUrl<T extends string = string> = T & Brand.Brand<TypeId>;
const BaseUrlBrand = Brand.nominal<BaseUrl>();

export const BaseUrl: S.Schema<BaseUrl, string> = Url.Url.pipe(
  S.fromBrand(BaseUrlBrand),
);

export function raw<T extends BaseUrl>(value: T): Brand.Brand.Unbranded<T> {
  // @ts-expect-error we're intentionally removing the brand here
  return value;
}

export function parseOrThrow<T extends string>(
  value: T,
): T & Brand.Brand<TypeId> {
  return S.decodeSync(BaseUrl)(value) as never;
}
