import * as S from "@effect/schema/Schema";

import * as BaseUrl from "./BaseUrl";

const VersionPattern = /^(.+\/)v\/(\d+)$/;

const TypeId: unique symbol = Symbol.for("@blockprotocol/graph/VersionedUrl");
export type TypeId = typeof TypeId;

export const VersionedUrl = BaseUrl.BaseUrl.pipe(
  S.pattern(VersionPattern),
  S.brand(TypeId),
);

export type VersionedUrl = S.Schema.To<typeof VersionedUrl>;

export function parseOrThrow(value: string): VersionedUrl {
  return S.decodeSync(VersionedUrl)(value);
}

export function base(value: VersionedUrl): BaseUrl.BaseUrl {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(VersionPattern)!;

  // again, value is guaranteed to be a string, because `Schema` guarantees a well-formed value.
  return match[1] as BaseUrl.BaseUrl;
}

export function version(value: VersionedUrl): number {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(VersionPattern)!;

  // again, value is guaranteed to be a number, because `Schema` guarantees a well-formed value.
  return parseInt(match[2]!, 10);
}
