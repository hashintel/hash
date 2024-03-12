import * as S from "@effect/schema/Schema";
import * as DataTypeUrl from "./DataTypeUrl";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataTypeReference",
);

export type TypeId = typeof TypeId;

export const DataTypeReference = S.struct({
  $ref: DataTypeUrl.DataTypeUrl,
}).pipe(S.brand(TypeId));

export type DataTypeReference = S.Schema.To<typeof DataTypeReference>;
