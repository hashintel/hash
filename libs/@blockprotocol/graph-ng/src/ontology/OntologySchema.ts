import * as S from "@effect/schema/Schema";

import * as Json from "../Json.js";
import * as DataType from "./DataType.js";
import * as DataTypeUrl from "./DataTypeUrl.js";
import * as PropertyType from "./PropertyType.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";

export const dataType = <
  Out,
  In extends Json.Value,
  Id extends DataTypeUrl.DataTypeUrl,
  R,
>(
  type: DataType.DataType<Out, In, Id, R>,
): S.Schema<Out, In, R> => type.schema.pipe(S.filter(() => true));

export const propertyType = <
  Out,
  In,
  Id extends PropertyTypeUrl.PropertyTypeUrl,
  R,
>(
  type: PropertyType.PropertyType<Out, In, Id, R>,
): S.Schema<Out, In, R> => type.schema;
