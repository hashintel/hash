import * as DataType from "../DataType";
import * as DataTypeUrl from "../DataTypeUrl";

export const V1 = {
  kind: "dataType",

  id: DataTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
  ),
  title: "Number",
  description: "An arithmetical value (in the Real number system)",

  type: "number",
} satisfies DataType.DataType;
