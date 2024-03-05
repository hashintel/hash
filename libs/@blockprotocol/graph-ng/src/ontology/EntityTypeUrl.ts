import * as S from "@effect/schema/Schema";

import * as VersionedUrl from "../VersionedUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/EntityTypeUrl",
);
export type TypeId = typeof TypeId;

export const EntityTypeUrl = VersionedUrl.VersionedUrl.pipe(S.brand(TypeId));

export type EntityTypeUrl = S.Schema.To<typeof EntityTypeUrl>;
