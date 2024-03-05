import * as S from "@effect/schema/Schema";
import * as DataTypeUrl from "./DataTypeUrl";
import * as Json from "./internal/Json";

export const DataTypeSchema = S.extend(
  S.struct({
    $schema: S.literal(
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    ),
    kind: S.literal("dataType"),
    $id: DataTypeUrl.DataTypeUrl,

    title: S.string,
    description: S.optional(S.string),

    type: S.string,
  }),
  S.record(S.string, Json.Value),
);

export type DataTypeSchema = S.Schema.To<typeof DataTypeSchema>;
