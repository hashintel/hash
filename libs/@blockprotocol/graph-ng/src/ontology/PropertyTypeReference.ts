import * as S from "@effect/schema/Schema";

import * as VersionedUrl from "../VersionedUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyTypeReference",
);
export type TypeId = typeof TypeId;

export const PropertyTypeReference = VersionedUrl.VersionedUrl.pipe(
  S.brand(TypeId),
);

export type PropertyTypeReference = S.Schema.To<typeof PropertyTypeReference>;
