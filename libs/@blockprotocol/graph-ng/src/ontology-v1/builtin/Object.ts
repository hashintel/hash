import * as DataType from "../DataType";
import * as DataTypeUrl from "../DataTypeUrl";

export const V1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
  ),
  title: "Object",
  description: "An opaque, untyped JSON object",

  type: "object",
} satisfies DataType.DataType;
