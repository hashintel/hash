import { Either } from "effect";

import {
  pruneUndefinedShallow,
  UndefinedOnPartialShallow,
} from "../../internal/schema.js";
import * as DataTypeUrl from "../DataTypeUrl.js";
import { BaseProperties } from "../internal/EncodeContext.js";
import { PropertyType } from "../PropertyType.js";
import * as PropertyTypeUrl from "../PropertyTypeUrl.js";
import { EncodeError } from "./error.js";

export interface IncompletePropertyTypeSchema {
  $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type";
  kind: "propertyType";
  $id: PropertyTypeUrl.PropertyTypeUrl;

  title: string;
  description?: string;
}

export interface PropertyTypeSchema
  extends IncompletePropertyTypeSchema,
    OneOf<PropertyValues> {}

export function makeBase(
  type: PropertyType<unknown>,
  properties: BaseProperties,
): Either.Either<IncompletePropertyTypeSchema, EncodeError> {
  if (properties.title === undefined) {
    return Either.left(EncodeError.incomplete("missing title"));
  }

  return Either.right(
    pruneUndefinedShallow({
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
      kind: "propertyType",
      $id: type.id,

      title: properties.title,
      description: properties.description,
    } satisfies UndefinedOnPartialShallow<IncompletePropertyTypeSchema>),
  );
}

export interface OneOf<T> {
  oneOf: readonly T[];
}

export interface Object<T> {
  type: "object";
  properties: Record<string, T>;

  required: readonly string[];
}

export interface Array<T> {
  type: "array";
  items: T;

  minItems?: number;
  maxItems?: number;
}

export interface Ref<T> {
  $ref: T;
}

export interface DataTypeReference extends Ref<DataTypeUrl.DataTypeUrl> {}
export interface PropertyTypeReference
  extends Ref<PropertyTypeUrl.PropertyTypeUrl> {}

export type PropertyTypeObjectValue =
  | PropertyTypeReference
  | Array<PropertyTypeReference>;

export interface PropertyTypeObject extends Object<PropertyTypeObjectValue> {}

export interface ArrayOfPropertyValues extends Array<OneOf<PropertyValues>> {}

export type PropertyValues =
  | DataTypeReference
  | PropertyTypeObject
  | ArrayOfPropertyValues;
