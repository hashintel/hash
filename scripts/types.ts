export type uri = string; // TODO

export type DataType = {
  kind: "dataType";
  $id: uri;
  name: string;
  description?: string;
  type: string;
  const?: [];
};

export const DATA_TYPES: Record<string, DataType> = {
  text: {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
    name: "Text",
    description: "An ordered sequence of characters",
    type: "string",
  },
  number: {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/number",
    name: "Number",
    description: "An arithmetical value (in the Real number system)",
    type: "number",
  },
  boolean: {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/boolean",
    name: "Boolean",
    description: "A True or False value",
    type: "boolean",
  },
  null: {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/null",
    name: "Null",
    description: "A placeholder value representing 'nothing'",
    type: "null",
  },
  object: {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/object",
    name: "Object",
    description: "A plain JSON object with no pre-defined structure",
    type: "object",
  },
  emptyList: {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/empty-list",
    name: "Empty List",
    description: "An Empty List",
    type: "array",
    const: [],
  },
};

// ---------------------------------------------------------------------------------
export const addPropertyValuesToPropertyType = (
  propertyType: PropertyType,
  propertyValues: PropertyValues,
) => {
  propertyType.oneOf.push(propertyValues);
};

/**
 * Specifies the structure of a Property Type
 */
export interface PropertyType {
  kind: "propertyType";
  $id: uri;
  name: string;
  description?: string;
  oneOf: PropertyValues[];
}

export const isPropertyValuesArray = (
  propertyValues: PropertyValues,
): propertyValues is PropertyValuesArray =>
  "type" in propertyValues && propertyValues.type === "array";

export type PropertyValues =
  | PropertyTypeObject
  | DataTypeReference
  | PropertyValuesArray;

export type PropertyValuesArray = {
  type: "array";
  items: {
    oneOf: [PropertyValues, ...PropertyValues[]];
  };
  minItems?: number;
  maxItems?: number;
};

export interface PropertyTypeObject {
  type: "object";
  properties: PropertyPropertiesBlob;
  required?: uri[];
}
export interface PropertyPropertiesBlob {
  /**
   * This interface was referenced by `undefined`'s JSON-Schema definition
   * via the `patternProperty` ".*".
   */
  [k: uri]:
    | PropertyTypeReference
    | {
        type: "array";
        items: PropertyTypeReference;
        minItems?: number;
        maxItems?: number;
      };
}
export interface PropertyTypeReference {
  $ref: uri;
}
export interface DataTypeReference {
  $ref: uri;
}

// ---------------------------------------------------------------------------------

/**
 * Specifies the structure of an Entity Type
 */
export interface EntityType {
  kind: "entityType";
  $id: uri;
  name: string;
  description?: string;
  properties: PropertyTypeObject;
  required?: uri[];
  requiredLinks?: uri[];
  links?: {
    [k: uri]: unknown;
  };
}
export interface PropertyTypeReference {
  $ref: uri;
}
