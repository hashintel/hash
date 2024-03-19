import { Either } from "effect";

import {
  pruneUndefinedShallow,
  UndefinedOnPartialShallow,
} from "../../internal/schema.js";
import { type DataType } from "../DataType.js";
import { EncodeError } from "./error.js";
import * as DataTypeUrl from "../DataTypeUrl.js";
import { BaseProperties } from "../internal/EncodeContext.js";

interface TypelessDataTypeSchema {
  $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type";
  kind: "dataType";
  $id: DataTypeUrl.DataTypeUrl;

  title: string;
  description?: string;
}

export interface BaseDataTypeSchema extends TypelessDataTypeSchema {
  type: string;
}

export function makeBase(
  type: DataType<unknown>,
  properties: BaseProperties,
): Either.Either<TypelessDataTypeSchema, EncodeError> {
  if (properties.title === undefined) {
    return Either.left(EncodeError.incomplete("missing title"));
  }

  return Either.right(
    pruneUndefinedShallow({
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      kind: "dataType",
      $id: type.id,

      title: properties.title,
      description: properties.description,
    } satisfies UndefinedOnPartialShallow<TypelessDataTypeSchema>),
  );
}

export interface ConstantDataTypeSchema<T> {
  const?: T;
}

export interface NumericDataTypeSchema extends ConstantDataTypeSchema<number> {
  multipleOf?: number;

  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
}

export interface NumberDataTypeSchema
  extends BaseDataTypeSchema,
    NumericDataTypeSchema {
  type: "number";
}

export interface IntegerDataTypeSchema
  extends BaseDataTypeSchema,
    NumericDataTypeSchema {
  type: "integer";
}

export interface StringDataTypeSchema
  extends BaseDataTypeSchema,
    ConstantDataTypeSchema<string> {
  type: "string";

  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface BooleanDataTypeSchema
  extends BaseDataTypeSchema,
    ConstantDataTypeSchema<boolean> {
  type: "boolean";
}

export interface NullDataTypeSchema
  extends BaseDataTypeSchema,
    ConstantDataTypeSchema<null> {
  type: "null";
}

// DataType arrays are opaque in `0.3`, with the only allowed constant value being `[]`
// `items`, `minItems`, `maxItems`, `uniqueItems` and so on are not supported
export interface ArrayDataTypeSchema
  extends BaseDataTypeSchema,
    ConstantDataTypeSchema<never[]> {
  type: "array";
}

// DataType objects are opaque in `0.3`.
// `properties`, `required`, `additionalProperties`, `minProperties`, `maxProperties` and so on are not supported
export interface ObjectDataTypeSchema extends BaseDataTypeSchema {
  type: "object";
}

export type DataTypeSchema =
  | NumberDataTypeSchema
  | IntegerDataTypeSchema
  | StringDataTypeSchema
  | BooleanDataTypeSchema
  | NullDataTypeSchema
  | ArrayDataTypeSchema
  | ObjectDataTypeSchema;
