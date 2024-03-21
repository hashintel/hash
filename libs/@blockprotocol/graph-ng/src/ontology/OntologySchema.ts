import * as S from "@effect/schema/Schema";

import * as Json from "../Json.js";
import * as DataType from "./DataType.js";
import * as DataTypeUrl from "./DataTypeUrl.js";

export const dataType = <
  Out,
  In extends Json.Value,
  Id extends DataTypeUrl.DataTypeUrl,
  R,
>(
  item: DataType.DataType<Out, In, Id, R>,
): S.Schema<Out, In, R> => item.schema.pipe(S.filter(() => true));
