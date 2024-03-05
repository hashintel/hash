import * as S from "@effect/schema/Schema";

import * as PropertyTypeUrl from "./PropertyTypeUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyTypeReference",
);
export type TypeId = typeof TypeId;

export const PropertyTypeReference = S.struct({
  $ref: PropertyTypeUrl.PropertyTypeUrl,
}).pipe(S.brand(TypeId));

export type PropertyTypeReference = S.Schema.To<typeof PropertyTypeReference>;
