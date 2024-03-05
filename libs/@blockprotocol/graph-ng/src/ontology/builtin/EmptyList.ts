import * as DataType from "../DataType";
import * as DataTypeUrl from "../DataTypeUrl";

export const V1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1",
  ),
  title: "Empty List",
  description: "An Empty List",

  type: "array",
  const: [],
} satisfies DataType.DataType;
