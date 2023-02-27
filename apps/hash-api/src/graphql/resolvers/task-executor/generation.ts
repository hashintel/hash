import {
  Array as TypeSystemArray,
  BaseUrl,
  ENTITY_TYPE_META_SCHEMA,
  EntityType,
  extractVersion,
  OneOf,
  PROPERTY_TYPE_META_SCHEMA,
  PropertyType,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { Logger } from "@local/hash-backend-utils/logger";
import { GraphApi, OntologyElementMetadata } from "@local/hash-graph-client";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityPropertiesObject, OwnedById } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { camelCase, isEqual, upperFirst } from "lodash";
import { singular } from "pluralize";

import { User } from "../../../graph/knowledge/system-types/user";

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
const OBJECT_DATA_TYPE_ID =
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";

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
  /** @todo - merging array oneOfs would be nice */
  /** @todo - merging objects would be nice */
  /** @todo - make properties required by default and set them to nullable if we encounter the same shape without it */
  /** @todo - remove object data type if we've got a new propertyTypeObject, just assume properties are nullable */
  if (!exists) {
    propertyType.oneOf.push(propertyValues);
  }
};

const stripDomain = (x: string) =>
  x.split("http://localhost:3000/@alice/types/")[1]!;

export const addOrUpdatePropertyTypeToEntityType = (
  entityType: EntityType,
  propertyType: PropertyType,
  isArray: boolean,
) => {
  const propertyTypeBaseId = extractBaseUrl(propertyType.$id);
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

export const getReferencedIdsFromPropertyType = (
  propertyType: PropertyType,
) => {
  const recurseOneOf = (oneOf: PropertyValues[]) => {
    const propertyTypeIds: VersionedUrl[] = [];

    for (const oneOfValue of oneOf) {
      if (isPropertyValuesArray(oneOfValue)) {
        propertyTypeIds.push(...recurseOneOf(oneOfValue.items.oneOf));
      } else if ("properties" in oneOfValue) {
        for (const propertyDefinition of Object.values(oneOfValue.properties)) {
          if ("items" in propertyDefinition) {
            propertyTypeIds.push(propertyDefinition.items.$ref);
          } else {
            propertyTypeIds.push(propertyDefinition.$ref);
          }
        }
      }
    }

    return propertyTypeIds;
  };

  return { propertyTypeIds: recurseOneOf(propertyType.oneOf) };
};

export const getReferencedIdsFromEntityType = (entityType: EntityType) => {
  const propertyTypeIds: VersionedUrl[] = [];
  const entityTypeIds: VersionedUrl[] = [];

  for (const propertyDefinition of Object.values(entityType.properties)) {
    if ("items" in propertyDefinition) {
      propertyTypeIds.push(propertyDefinition.items.$ref);
    } else {
      propertyTypeIds.push(propertyDefinition.$ref);
    }
  }
  // TODO: will we ever have inheritance on generated types?
  // for (const inheritedEntityType of entityType.allOf ?? []) {
  //   values.push(inheritedEntityType.$ref)
  // }
  for (const [linkTypeId, linkDefinition] of typedEntries(
    entityType.links ?? {},
  )) {
    entityTypeIds.push(linkTypeId);
    if ("items" in linkDefinition && "oneOf" in linkDefinition.items) {
      entityTypeIds.push(
        ...linkDefinition.items.oneOf.map((oneOfEntry) => oneOfEntry.$ref),
      );
    }
  }

  return { propertyTypeIds, entityTypeIds };
};

export const createPropertyTypeTree = async (
  graphApi: GraphApi,
  logger: Logger,
  propertyTypeId: VersionedUrl,
  propertyTypeMap: Record<
    VersionedUrl,
    { schema: PropertyType; created: boolean }
  >,
  user: User,
  visited: VersionedUrl[],
  currentPath: string[],
) => {
  const path = [...currentPath, stripDomain(propertyTypeId)];

  logger.silly(`Traversing ${stripDomain(propertyTypeId)}`);
  const record = propertyTypeMap[propertyTypeId]!;

  const createdPropertyTypes: OntologyElementMetadata[] = [];

  // Check for circular dependency
  if (visited.findIndex((ele) => ele === propertyTypeId) !== -1) {
    logger.silly(
      `Circular dependency detected, short circuiting, path: ${JSON.stringify(
        path,
      )}`,
    );
    return { createdPropertyTypes };
  }

  if (!record.created) {
    visited.push(propertyTypeId);

    const { propertyTypeIds } = getReferencedIdsFromPropertyType(record.schema);

    for (const referencedPropertyTypeId of propertyTypeIds) {
      const { createdPropertyTypes: newCreatedPropertyTypes } =
        await createPropertyTypeTree(
          graphApi,
          logger,
          referencedPropertyTypeId,
          propertyTypeMap,
          user,
          visited,
          path,
        );

      createdPropertyTypes.push(...newCreatedPropertyTypes);
    }
  }
  if (!record.created) {
    try {
      logger.debug(`Creating property type: ${stripDomain(propertyTypeId)}`);
      createdPropertyTypes.push(
        (
          await graphApi.createPropertyType({
            ownedById: user.accountId as OwnedById,
            actorId: user.accountId,
            schema: record.schema,
          })
        ).data,
      );
    } catch (err) {
      throw new Error(
        `failed to create property type:\n - err: ${JSON.stringify(
          err,
        )}\n - schema: ${JSON.stringify(record.schema)}`,
      );
    }

    record.created = true;
  }

  return { createdPropertyTypes };
};

export const createEntityTypeTree = async (
  graphApi: GraphApi,
  logger: Logger,
  entityTypeId: VersionedUrl,
  entityTypeMap: Record<VersionedUrl, { schema: EntityType; created: boolean }>,
  propertyTypeMap: Record<
    VersionedUrl,
    { schema: PropertyType; created: boolean }
  >,
  user: User,
  visited: VersionedUrl[],
  currentPath: string[],
) => {
  const path = [...currentPath, stripDomain(entityTypeId)];

  logger.silly(`Traversing ${stripDomain(entityTypeId)}`);
  const record = entityTypeMap[entityTypeId]!;

  const createdPropertyTypes: OntologyElementMetadata[] = [];
  const createdEntityTypes: OntologyElementMetadata[] = [];

  // Check for circular dependency
  if (visited.findIndex((ele) => ele === entityTypeId) !== -1) {
    logger.silly(
      `Circular dependency detected, short circuiting, path: ${JSON.stringify(
        path,
      )}`,
    );
    return { createdPropertyTypes, createdEntityTypes };
  }

  // TODO - GitHub event breaking
  if (!record.created) {
    visited.push(entityTypeId);

    const { propertyTypeIds, entityTypeIds } = getReferencedIdsFromEntityType(
      record.schema,
    );

    for (const referencedPropertyTypeId of propertyTypeIds) {
      const { createdPropertyTypes: newCreatedPropertyTypes } =
        await createPropertyTypeTree(
          graphApi,
          logger,
          referencedPropertyTypeId,
          propertyTypeMap,
          user,
          visited,
          path,
        );

      createdPropertyTypes.push(...newCreatedPropertyTypes);
    }

    for (const referencedEntityTypeId of entityTypeIds) {
      const {
        createdPropertyTypes: newCreatedPropertyTypes,
        createdEntityTypes: newCreatedEntityTypes,
      } = await createEntityTypeTree(
        graphApi,
        logger,
        referencedEntityTypeId,
        entityTypeMap,
        propertyTypeMap,
        user,
        visited,
        path,
      );

      createdPropertyTypes.push(...newCreatedPropertyTypes);
      createdEntityTypes.push(...newCreatedEntityTypes);
    }
  }
  if (!record.created) {
    try {
      logger.debug(`Creating entity type: ${stripDomain(entityTypeId)}`);
      createdEntityTypes.push(
        (
          await graphApi.createEntityType({
            ownedById: user.accountId as OwnedById,
            actorId: user.accountId,
            schema: record.schema,
          })
        ).data,
      );
    } catch (err) {
      throw new Error(
        `failed to create entity type:\n - err: ${JSON.stringify(
          err,
        )}\n - schema: ${JSON.stringify(record.schema)}`,
      );
    }

    record.created = true;
  }

  return {
    createdPropertyTypes,
    createdEntityTypes,
  };
};

/* eslint-disable no-param-reassign -- We want to mutate in place for efficiency */

/**
 * Does a post-order traversal of a JSON object tree, transforming the object into the Type System.
 *
 * Keys and their properties are mapped into Property Types
 *
 * @param key
 * @param jsonValue
 * @param streamKeyMap - A map of keys to their associated Property Type
 * @param streamName
 * @param integration
 * @param namespace
 * @param path {string[]} - The JSON path (represented as a list) of keys that lead to this value
 */
const traverseJsonValue = ({
  key,
  jsonValue,
  streamKeyMap,
  streamName,
  integration,
  namespace,
  path,
}: {
  key: string | undefined;
  jsonValue: JsonValue;
  streamKeyMap: Record<string, PropertyType>;
  streamName: string;
  integration: string;
  namespace: string;
  path: string[];
}) => {
  const currentPath = key ? [...path, key] : [...path];
  const compiledKey = currentPath.join("-");

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
        traverseJsonValue({
          key: undefined,
          jsonValue: arrayVal,
          streamKeyMap,
          streamName,
          integration,
          namespace,
          path: currentPath,
        }),
      ) as [PropertyValues, ...PropertyValues[]];
      propertyTypeValue = {
        type: "array",
        items: {
          oneOf: inner,
        },
      };
    }
  } else if (typeof jsonValue === "object") {
    const properties: Record<BaseUrl, ValueOrArray<PropertyTypeReference>> = {};

    if (Object.keys(jsonValue).length === 0) {
      // PropertyTypeObjects can't have 0 properties, and we don't know anything about the potential values so we have
      // to fall back to the Object Data Type
      propertyTypeValue = {
        $ref: OBJECT_DATA_TYPE_ID,
      };
    } else {
      for (const [innerKey, innerVal] of typedEntries(jsonValue)) {
        const innerPropertyValue = traverseJsonValue({
          key: innerKey,
          jsonValue: innerVal,
          streamKeyMap,
          streamName,
          integration,
          namespace,
          path: currentPath,
        });

        const compiledInnerKey = [...currentPath, innerKey].join("-");

        const propertyTypeId = streamKeyMap[compiledInnerKey]?.$id;
        if (!propertyTypeId) {
          throw new Error(`Missing property type for key: ${compiledInnerKey}`);
        }

        jsonValue[extractBaseUrl(propertyTypeId)] = innerVal;
        delete jsonValue[innerKey];

        if (isPropertyValuesArray(innerPropertyValue)) {
          properties[extractBaseUrl(propertyTypeId)] = {
            type: "array",
            items: {
              $ref: propertyTypeId,
            },
          };
        } else {
          properties[extractBaseUrl(propertyTypeId)] = { $ref: propertyTypeId };
        }
      }

      propertyTypeValue = {
        type: "object",
        properties,
      };
    }
  } else {
    throw Error(
      `Unsupported JSON type encountered, key: ${
        key ?? "None"
      }, val: ${jsonValue}, typeof: ${typeof jsonValue}`,
    );
  }

  if (key !== undefined) {
    let propertyType = streamKeyMap[compiledKey];

    if (!propertyType) {
      propertyType = {
        $schema: PROPERTY_TYPE_META_SCHEMA,
        kind: "propertyType",
        $id: generateTypeId({
          namespace,
          kind: "property-type",
          title: key,
          slugOverride: `generated-${integration}-${streamName}-${encodeURIComponent(
            compiledKey,
          )}`,
        }),
        title: key,
        oneOf: [propertyTypeValue],
        description:
          `An autogenerated type from the ${streamName} stream from ${integration}.${
            currentPath.length > 1
          }`
            ? ` This property was generated from the JSON path: ${currentPath.join(
                ".",
              )}`
            : "",
      };
    } else {
      addPropertyValuesToPropertyType(propertyType, propertyTypeValue);
    }

    streamKeyMap[compiledKey] = propertyType;
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
  namespace: string,
): { entityProperties: EntityPropertiesObject; entityType: EntityType } => {
  const title = streamNameToEntityTypeName(integration, streamName);

  const entityType: EntityType = existingEntityType ?? {
    $schema: ENTITY_TYPE_META_SCHEMA,
    kind: "entityType",
    $id: generateTypeId({
      namespace,
      kind: "entity-type",
      title,
      slugOverride: `generated-${integration}-${streamName}`,
    }),
    type: "object",
    title,
    description: `An autogenerated type for the ${streamName} stream from ${integration}.`,
    properties: {},
  };

  for (const [key, jsonValue] of typedEntries(entityProperties)) {
    if (Array.isArray(jsonValue) && jsonValue.length !== 0) {
      let propertyType;
      for (const arrayVal of jsonValue) {
        traverseJsonValue({
          key,
          jsonValue: arrayVal,
          streamKeyMap,
          streamName,
          integration,
          namespace,
          path: [],
        });

        propertyType = streamKeyMap[key];
        if (!propertyType) {
          throw new Error(`Missing property type for key: ${key}`);
        }

        addOrUpdatePropertyTypeToEntityType(entityType, propertyType, true);
      }
      entityProperties[extractBaseUrl(propertyType?.$id!)] = jsonValue;
      delete entityProperties[key];
    } else {
      traverseJsonValue({
        key,
        jsonValue,
        streamKeyMap,
        streamName,
        integration,
        namespace,
        path: [],
      });

      const propertyType = streamKeyMap[key];
      if (!propertyType) {
        throw new Error(`Missing property type for key: ${key}`);
      }

      addOrUpdatePropertyTypeToEntityType(entityType, propertyType, false);

      entityProperties[extractBaseUrl(propertyType.$id)] = jsonValue;
      delete entityProperties[key];
    }
  }

  return { entityProperties, entityType };
};
/* eslint-enable no-param-reassign */
