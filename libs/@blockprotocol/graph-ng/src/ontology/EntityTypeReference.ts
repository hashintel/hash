import * as S from "@effect/schema/Schema";

import * as VersionedUrl from "../VersionedUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/EntityTypeReference",
);
export type TypeId = typeof TypeId;

export const EntityTypeReference = VersionedUrl.VersionedUrl.pipe(
  S.brand(TypeId),
);

export type EntityTypeReference = S.Schema.To<typeof EntityTypeReference>;
