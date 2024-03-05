import * as DataType from "../DataType";
import * as DataTypeUrl from "../DataTypeUrl";

export const V1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
  ),
  title: "Text",
  description: "An ordered sequence of characters",

  type: "string",
} satisfies DataType.DataType;
