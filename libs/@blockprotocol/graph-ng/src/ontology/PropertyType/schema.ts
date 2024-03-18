import * as DataTypeUrl from "../DataTypeUrl.js";
import * as PropertyTypeUrl from "../PropertyTypeUrl.js";

export interface PropertyTypeSchema extends OneOf<PropertyValues> {
  $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type";
  kind: "propertyType";
  $id: string;

  title: string;
  description?: string;
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

export interface PropertyTypeObject
  extends Object<PropertyTypeReference | Array<PropertyTypeReference>> {}

export interface ArrayOfPropertyValues extends Array<OneOf<PropertyValues>> {}

export type PropertyValues =
  | DataTypeReference
  | PropertyTypeObject
  | ArrayOfPropertyValues;
