import * as S from "@effect/schema/Schema";

import * as VersionedUrl from "../VersionedUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyTypeUrl",
);
export type TypeId = typeof TypeId;

export const PropertyTypeUrl = VersionedUrl.VersionedUrl.pipe(S.brand(TypeId));

export type PropertyTypeUrl = S.Schema.To<typeof PropertyTypeUrl>;
