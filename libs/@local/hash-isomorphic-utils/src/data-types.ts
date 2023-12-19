import { VersionedUrl } from "@blockprotocol/type-system";
import { Subtype } from "@local/advanced-types/subtype";
import { DataType } from "@local/hash-graph-client";
import { DistributiveOmit } from "@local/hash-isomorphic-utils/util";

/**
 * Non-exhaustive list of possible values for 'format'
 *
 * The presence of a format in this list does _NOT_ mean that:
 * 1. The Graph will validate it
 * 2. The frontend will treat it differently for input or display
 *
 * @see https://json-schema.org/understanding-json-schema/reference/string
 */
type StringFormat =
  | "date"
  | "time"
  | "date-time"
  | "duration"
  | "email"
  | "hostname"
  | "ipv4"
  | "ipv6"
  | "regex"
  | "uri"
  | "uuid";

export type StringConstraint = {
  format?: StringFormat;
  minLength?: number; // Int
  maxLength?: number; // Int
  pattern?: string; // RegExp
  type: "string";
};

export type NumberConstraint = {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  type: "number" | "integer";
};

export type BooleanConstraint = {
  type: "boolean";
};

export type NullConstraint = {
  type: "null";
};

export type StringEnumConstraint = {
  enum: string[];
  type: "string";
};

export type NumberEnumConstraint = {
  enum: number[];
  type: "number" | "integer";
};

/** @see https://json-schema.org/understanding-json-schema/reference/enum */
export type EnumConstraint = StringEnumConstraint | NumberEnumConstraint;

export type StringConstConstraint = {
  const: string;
  type: "string";
};

export type NumberConstConstraint = {
  const: number;
  type: "number" | "integer";
};

export type ConstConstraint = StringConstConstraint | NumberConstConstraint;

type ValueLabel = {
  left?: string;
  right?: string;
};

export type SingleValueConstraint =
  | BooleanConstraint
  | NullConstraint
  | StringConstraint
  | NumberConstraint
  | EnumConstraint
  | ConstConstraint;

export type ArrayConstraint = {
  type: "array";
  items: ValueConstraint;
};

/** @see https://json-schema.org/understanding-json-schema/reference/array#tuple-validation */
export type TupleConstraint = {
  type: "array";
  items: false; // disallow additional items;
  prefixItems: ValueConstraint[];
};

export type ValueConstraint = (
  | SingleValueConstraint
  | ArrayConstraint
  | TupleConstraint
) & { description?: string; label?: ValueLabel };

export type CustomDataType = Subtype<
  DataType,
  {
    description?: string;
    $id: VersionedUrl;
    kind: "dataType";
    $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type";
    title: string;
  } & ValueConstraint
>;

export type ConstructDataTypeParams = DistributiveOmit<
  CustomDataType,
  "$id" | "kind" | "$schema"
>;
