import {
  Array as TypeSystemArray,
  BaseUri,
  EntityType,
  extractBaseUri,
  extractVersion,
  OneOf,
  PropertyType,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
} from "@blockprotocol/type-system";
import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { PropertyObject } from "@hashintel/hash-subgraph";
import { camelCase, isEqual, upperFirst } from "lodash";
import { singular } from "pluralize";

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

export const streamNameToEntityTypeName = (source: string, name: string) => {
  return singular(upperFirst(camelCase(`${source}_${name}`)));
};

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

export const addOrUpdatePropertyTypeToEntityType = (
  entityType: EntityType,
  propertyType: PropertyType,
  isArray: boolean,
) => {
  const propertyTypeBaseId = extractBaseUri(propertyType.$id);
  const exists = Object.keys(entityType.properties).find(
    (existingPropertyBaseId) => existingPropertyBaseId === propertyTypeBaseId,
  );

  if (!exists) {
    // eslint-disable-next-line no-param-reassign
    entityType.properties[propertyTypeBaseId] = isArray
      ? {
          type: "array",
          items: {
            $ref: propertyType.$id,
          },
        }
      : {
          $ref: propertyType.$id,
        };
  } else {
    /** @todo - How do we handle conversion to/from array as needed for edge-cases */
    const existingPropertyDefinition =
      entityType.properties[propertyTypeBaseId]!;

    if ("$ref" in existingPropertyDefinition) {
      if (
        extractVersion(existingPropertyDefinition.$ref) <
        extractVersion(propertyType.$id)
      ) {
        existingPropertyDefinition.$ref = propertyType.$id;
      }
    } else if (
      extractVersion(existingPropertyDefinition.items.$ref) <
      extractVersion(propertyType.$id)
    ) {
      existingPropertyDefinition.items.$ref = propertyType.$id;
    }
  }
};

/* eslint-disable no-param-reassign -- We want to mutate in place for efficiency */

/** @todo - improve doc */
/// post-order traversal of the JSON object tree
const traverseJsonValue = (
  key: string | undefined,
  jsonValue: JsonValue,
  streamKeyMap: Record<string, PropertyType>,
  streamName: string,
) => {
  let propertyTypeValue: PropertyValues;
  if (typeof jsonValue === "boolean") {
    propertyTypeValue = {
      $ref: BOOLEAN_DATA_TYPE_ID,
    };
  } else if (typeof jsonValue === "number") {
    propertyTypeValue = {
      $ref: NUMBER_DATA_TYPE_ID,
    };
  } else if (typeof jsonValue === "string") {
    propertyTypeValue = {
      $ref: TEXT_DATA_TYPE_ID,
    };
  } else if (jsonValue === null) {
    propertyTypeValue = {
      $ref: NULL_DATA_TYPE_ID,
    };
  } else if (Array.isArray(jsonValue)) {
    if (jsonValue.length === 0) {
      propertyTypeValue = {
        $ref: EMPTY_LIST_DATA_TYPE_ID,
      };
    } else {
      const inner = jsonValue.map((arrayVal) =>
        traverseJsonValue(undefined, arrayVal, streamKeyMap, streamName),
      ) as [PropertyValues, ...PropertyValues[]];
      propertyTypeValue = {
        type: "array",
        items: {
          oneOf: inner,
        },
      };
    }
  } else if (typeof jsonValue === "object") {
    const properties: Record<BaseUri, ValueOrArray<PropertyTypeReference>> = {};

    for (const [innerKey, innerVal] of Object.entries(jsonValue)) {
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

      jsonValue[extractBaseUri(propertyTypeId)] = innerVal;
      delete jsonValue[innerKey];

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
      }, val: ${jsonValue}, typeof: ${typeof jsonValue}`,
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

    streamKeyMap[key] = propertyType;
  }

  return propertyTypeValue;
};
/* eslint-enable no-param-reassign */

/* eslint-disable no-param-reassign -- We want to mutate in place for efficiency */
export const rewriteEntityPropertiesInTypeSystem = (
  entityProperties: JsonObject,
  streamKeyMap: Record<string, PropertyType>,
  existingEntityType: EntityType | undefined,
  streamName: string,
  integration: string,
): { entityProperties: PropertyObject; entityType: EntityType } => {
  const title = streamNameToEntityTypeName(integration, streamName);

  /** @todo - improve description and title and such of this */
  const entityType: EntityType = existingEntityType ?? {
    $id: generateTypeId({
      namespace: "alice",
      kind: "entity-type",
      title,
      slugOverride: `generated-${streamName}`,
    }),
    kind: "entityType",
    type: "object",
    title,
    description: "An autogenerated type.",
    properties: {},
  };

  for (const [key, val] of Object.entries(entityProperties)) {
    if (Array.isArray(val) && val.length !== 0) {
      let propertyType;
      for (const arrayVal of val) {
        traverseJsonValue(key, arrayVal, streamKeyMap, streamName);

        propertyType = streamKeyMap[key];
        if (!propertyType) {
          throw new Error(`Missing property type for key: ${key}`);
        }

        addOrUpdatePropertyTypeToEntityType(entityType, propertyType, true);
      }
      entityProperties[extractBaseUri(propertyType?.$id!)] = val;
      delete entityProperties[key];
    } else {
      traverseJsonValue(key, val, streamKeyMap, streamName);

      const propertyType = streamKeyMap[key];
      if (!propertyType) {
        throw new Error(`Missing property type for key: ${key}`);
      }

      addOrUpdatePropertyTypeToEntityType(entityType, propertyType, false);

      entityProperties[extractBaseUri(propertyType.$id)] = val;
      delete entityProperties[key];
    }
  }

  return { entityProperties: entityProperties as PropertyObject, entityType };
};
/* eslint-enable no-param-reassign */
