import * as S from "@effect/schema/Schema";
import { Brand } from "effect";

import * as Url from "./internal/Url";

const TypeId: unique symbol = Symbol.for("@blockprotocol/graph/BaseUrl");
export type TypeId = typeof TypeId;

export const BaseUrl = Url.Url.pipe(S.brand(TypeId));

export type BaseUrl = S.Schema.To<typeof BaseUrl>;

export function parseOrThrow<T extends string>(
  value: T,
): T & Brand.Brand<TypeId> {
  return S.decodeSync(BaseUrl)(value) as never;
}
