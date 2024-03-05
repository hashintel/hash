import * as S from "@effect/schema/Schema";

import * as Url from "./Url";

const VersionPattern = /^(.*)\/v\/(\d+)$/;

export const TypeId = Symbol.for("@blockprotocol/graph/VersionedUrl");
export type TypeId = typeof TypeId;

export const Schema = Url.Schema.pipe(
  S.pattern(VersionPattern),
  S.brand(TypeId),
);

export type Schema = S.Schema.To<typeof Schema>;

export function url(value: Schema): Url.Schema {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(VersionPattern)!;

  // again, value is guaranteed to be a string, because `Schema` guarantees a well-formed value.
  return match[1] as Url.Schema;
}

export function version(value: Schema): number {
  // the value is never null or undefined, because `Schema` guarantees a well-formed value.
  const match = value.match(VersionPattern)!;

  // again, value is guaranteed to be a number, because `Schema` guarantees a well-formed value.
  return parseInt(match[2]!, 10);
}
