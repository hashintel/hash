import {
  Array as TypeSystemArray,
  BaseUri,
  extractBaseUri,
  OneOf,
  PropertyType,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
} from "@blockprotocol/type-system";
import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { isEqual } from "lodash";

const TEXT_DATA_TYPE_ID =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
const NUMBER_DATA_TYPE_ID =
  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
const BOOLEAN_DATA_TYPE_ID =
  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
const NULL_DATA_TYPE_ID =
  "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1";
const EMPTY_LIST_DATA_TYPE_ID =
  "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1";
// const OBJECT_DATA_TYPE_ID =
//   "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | JsonObject;

export type JsonObject = { [key: string]: JsonValue };

export const isPropertyValuesArray = (
  propertyValues: PropertyValues,
): propertyValues is TypeSystemArray<OneOf<PropertyValues>> =>
  "type" in propertyValues && propertyValues.type === "array";

export const addPropertyValuesToPropertyType = (
  propertyType: PropertyType,
  propertyValues: PropertyValues,
) => {
  const exists = propertyType.oneOf.find((oneOfValue) =>
    isEqual(oneOfValue, propertyValues),
  );
  if (!exists) {
    propertyType.oneOf.push(propertyValues);
  }
};

// post-order traversal of the JSON object tree
const traverseJsonValue = (
  key: string | undefined,
  val: JsonValue,
  streamKeyMap: Record<string, PropertyType>,
  streamName: string,
) => {
  let propertyTypeValue: PropertyValues;
  if (typeof val === "boolean") {
    propertyTypeValue = {
      $ref: BOOLEAN_DATA_TYPE_ID,
    };
  } else if (typeof val === "number") {
    propertyTypeValue = {
      $ref: NUMBER_DATA_TYPE_ID,
    };
  } else if (typeof val === "string") {
    propertyTypeValue = {
      $ref: TEXT_DATA_TYPE_ID,
    };
  } else if (val === null) {
    propertyTypeValue = {
      $ref: NULL_DATA_TYPE_ID,
    };
  } else if (Array.isArray(val)) {
    if (val.length === 0) {
      propertyTypeValue = {
        $ref: EMPTY_LIST_DATA_TYPE_ID,
      };
    } else {
      const inner = val.map((arrayVal) =>
        traverseJsonValue(undefined, arrayVal, streamKeyMap, streamName),
      ) as [PropertyValues, ...PropertyValues[]];
      propertyTypeValue = {
        type: "array",
        items: {
          oneOf: inner,
        },
      };
    }
  } else if (typeof val === "object") {
    const properties: Record<BaseUri, ValueOrArray<PropertyTypeReference>> = {};

    for (const [innerKey, innerVal] of Object.entries(val)) {
      const innerPropertyValue = traverseJsonValue(
        innerKey,
        innerVal,
        streamKeyMap,
        streamName,
      );
      const propertyTypeId = streamKeyMap[innerKey]?.$id;
      if (!propertyTypeId) {
        throw new Error(`Missing property type for key: ${innerKey}`);
      }

      if (isPropertyValuesArray(innerPropertyValue)) {
        properties[extractBaseUri(propertyTypeId)] = {
          type: "array",
          items: {
            $ref: propertyTypeId,
          },
        };
      } else {
        properties[extractBaseUri(propertyTypeId)] = { $ref: propertyTypeId };
      }
    }

    propertyTypeValue = {
      type: "object",
      properties,
    };
  } else {
    throw Error(
      `Unsupported JSON type encountered, key: ${
        key ?? "None"
      }, val: ${val}, typeof: ${typeof val}`,
    );
  }

  if (key !== undefined) {
    let propertyType = streamKeyMap[key];

    if (!propertyType) {
      propertyType = {
        kind: "propertyType",
        $id: generateTypeId({
          namespace: "alice",
          kind: "property-type",
          title: key,
          slugOverride: `generated-${streamName}-${key}`,
        }),
        title: key,
        oneOf: [propertyTypeValue],
      };
    } else {
      addPropertyValuesToPropertyType(propertyType, propertyTypeValue);
    }

    // eslint-disable-next-line no-param-reassign
    streamKeyMap[key] = propertyType;
  }

  return propertyTypeValue;
};

export const transformEntityToTypeSystem = (
  entity: JsonObject,
  streamKeyMap: Record<string, PropertyType>,
  streamName: string,
) => {
  for (const [key, val] of Object.entries(entity)) {
    if (Array.isArray(val) && val.length !== 0) {
      for (const arrayVal of val) {
        traverseJsonValue(key, arrayVal, streamKeyMap, streamName);

        const propertyTypeId = streamKeyMap[key]?.$id;
        if (!propertyTypeId) {
          throw new Error(`Missing property type for key: ${key}`);
        }

        // TODO: create entity type
      }
    } else {
      traverseJsonValue(key, val, streamKeyMap, streamName);

      const propertyTypeId = streamKeyMap[key]?.$id;
      if (!propertyTypeId) {
        throw new Error(`Missing property type for key: ${key}`);
      }

      // TODO: create entity type
    }
  }
};
