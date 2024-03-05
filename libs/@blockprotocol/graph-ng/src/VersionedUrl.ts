import * as S from "@effect/schema/Schema";

import * as Url from "./Url";

const VersionPattern = /^(.+\/)v\/(\d+)$/;

const TypeId: unique symbol = Symbol.for("@blockprotocol/graph/VersionedUrl");
export type TypeId = typeof TypeId;

export const VersionedUrl = Url.Url.pipe(
  S.pattern(VersionPattern),
  S.brand(TypeId),
);

export type VersionedUrl = S.Schema.To<typeof VersionedUrl>;

export function url(value: VersionedUrl): Url.Url {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(VersionPattern)!;

  // again, value is guaranteed to be a string, because `Schema` guarantees a well-formed value.
  return match[1] as Url.Url;
}

export function version(value: VersionedUrl): number {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(VersionPattern)!;

  // again, value is guaranteed to be a number, because `Schema` guarantees a well-formed value.
  return parseInt(match[2]!, 10);
}
