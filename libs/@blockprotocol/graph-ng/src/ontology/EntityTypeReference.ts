import * as S from "@effect/schema/Schema";

import * as EntityTypeUrl from "./EntityTypeUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/EntityTypeReference",
);
export type TypeId = typeof TypeId;

export const EntityTypeReference = S.struct({
  $ref: EntityTypeUrl.EntityTypeUrl,
}).pipe(S.brand(TypeId));

export type EntityTypeReference = S.Schema.To<typeof EntityTypeReference>;
