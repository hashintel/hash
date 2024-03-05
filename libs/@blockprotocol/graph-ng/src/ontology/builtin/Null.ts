import * as DataType from "../DataType";
import * as DataTypeUrl from "../DataTypeUrl";

export const V1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1",
  ),
  title: "Null",
  description: "A placeholder value representing 'nothing'",

  type: "null",
} satisfies DataType.DataType;
