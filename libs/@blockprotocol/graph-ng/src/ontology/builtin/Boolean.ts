import * as DataType from "../DataType";
import * as DataTypeUrl from "../DataTypeUrl";

export const V1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
  ),
  title: "Boolean",
  description: "A True or False value",

  type: "boolean",
} satisfies DataType.DataType;
