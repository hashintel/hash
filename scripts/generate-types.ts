import {
  addPropertyValuesToPropertyType,
  DataType,
  PropertyPropertiesBlob,
  PropertyType,
  PropertyValues,
  uri,
  isPropertyValuesArray,
} from "./types";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | JsonObject;

export type JsonObject = { [key: string]: JsonValue };

const generateUri = (
  namespace: string,
  stream: string,
  metaType: string,
  key: string,
) => {
  return `https://blockprotocol.org/@${namespace}/types/${metaType}/auto-generated/${stream}-${key}`;
};

const keysToPropertyTypes: Record<string, PropertyType> = {};
const keysToDataTypes: Record<uri, DataType> = {
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

// post-order traversal of the JSON object tree
const traverse = (key: string | undefined, val: JsonValue): PropertyValues => {
  let propertyTypeValue: PropertyValues;
  if (typeof val === "boolean") {
    propertyTypeValue = {
      $ref: keysToDataTypes.text!.$id,
    };
  } else if (typeof val === "number") {
    propertyTypeValue = {
      $ref: keysToDataTypes.number!.$id,
    };
  } else if (typeof val === "string") {
    propertyTypeValue = {
      $ref: keysToDataTypes.text!.$id,
    };
  } else if (val === null) {
    propertyTypeValue = {
      $ref: keysToDataTypes.null!.$id,
    };
  } else if (Array.isArray(val)) {
    if (val.length == 0) {
      propertyTypeValue = {
        $ref: keysToDataTypes.emptyList!.$id,
      };
    } else {
      const inner = val.map((x) => traverse(undefined, x)) as [
        PropertyValues,
        ...PropertyValues[]
      ];
      propertyTypeValue = {
        type: "array",
        items: {
          oneOf: inner,
        },
      };
    }
  } else if (typeof val == "object") {
    const properties: PropertyPropertiesBlob = {};

    for (let [innerKey, innerVal] of Object.entries(val)) {
      const innerPropertyValue = traverse(innerKey, innerVal);
      const propertyType = keysToPropertyTypes[innerKey];
      if (propertyType == null) {
        throw Error(`Couldn't find Property Type for key: ${innerKey}`);
      }

      if (isPropertyValuesArray(innerPropertyValue)) {
        properties[propertyType.$id] = {
          type: "array",
          items: {
            $ref: propertyType.$id,
          },
        };
      } else {
        properties[propertyType.$id] = { $ref: propertyType.$id };
      }
    }

    propertyTypeValue = {
      type: "object",
      properties,
    };
  } else {
    throw Error(
      `I'm real confused, key: ${key}, val: ${val}, typeof: ${typeof val}`,
    );
  }

  if (key != undefined) {
    let propertyType = keysToPropertyTypes[key] || {
      kind: "propertyType",
      $id: generateUri("alice", "foo", "property-type", key),
      name: key,
      oneOf: [],
    };

    addPropertyValuesToPropertyType(propertyType, propertyTypeValue);

    keysToPropertyTypes[key] = propertyType;
  }

  return propertyTypeValue;
};

const generateTypes = (obj: JsonValue) => {
  traverse(undefined, obj);
  console.log(JSON.stringify(keysToPropertyTypes, null, 4));
};

generateTypes(randomObj);
