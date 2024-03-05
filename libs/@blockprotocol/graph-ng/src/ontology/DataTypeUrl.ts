import * as S from "@effect/schema/Schema";

import * as VersionedUrl from "../VersionedUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataTypeUrl",
);
export type TypeId = typeof TypeId;

export const DataTypeUrl = VersionedUrl.VersionedUrl.pipe(S.brand(TypeId));

export type DataTypeUrl = S.Schema.To<typeof DataTypeUrl>;
