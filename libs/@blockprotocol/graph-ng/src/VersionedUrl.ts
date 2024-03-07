import * as S from "@effect/schema/Schema";
import { Brand } from "effect";

import * as BaseUrl from "./BaseUrl";
import * as Url from "./internal/Url";

const TypeId: unique symbol = Symbol.for("@blockprotocol/graph/VersionedUrl");
export type TypeId = typeof TypeId;

export const Pattern = /^(.+\/)v\/(\d+)$/;
export type Pattern<T extends string> = `${T}/v/${number}`;

// Pattern ensures that we obey the versioning scheme, therefore using the literal pattern
// cast is okay here.
export const VersionedUrl = Url.Url.pipe(
  S.pattern(Pattern),
  S.brand(TypeId),
) as unknown as S.Schema<VersionedUrl, string>;

export type VersionedUrl<T extends BaseUrl.BaseUrl = BaseUrl.BaseUrl> =
  Pattern<T> & Brand.Brand<TypeId>;

export function parseOrThrow<T extends string>(
  value: T,
): T extends Pattern<infer U>
  ? VersionedUrl<U & Brand.Brand<BaseUrl.TypeId>>
  : VersionedUrl {
  return S.decodeSync(VersionedUrl)(value) as never;
}

export type Base<T extends VersionedUrl> =
  T extends VersionedUrl<infer U> ? U : never;
export function base<T extends VersionedUrl>(value: T): Base<T> {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(Pattern)!;

  // again, value is guaranteed to be a string, because `Schema` guarantees a well-formed value.
  return match[1] as never;
}

export function version(value: VersionedUrl): number {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(Pattern)!;

  // again, value is guaranteed to be a number, because `Schema` guarantees a well-formed value.
  return parseInt(match[2]!, 10);
}
