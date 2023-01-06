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
  VersionedUri,
} from "@blockprotocol/type-system";
import {
  GraphApi,
  OntologyElementMetadata,
} from "@hashintel/hash-graph-client";
import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { OwnedById } from "@hashintel/hash-shared/types";
import { typedEntries } from "@hashintel/hash-shared/util";
import { PropertyObject } from "@hashintel/hash-subgraph";
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

export const getReferencedIdsFromPropertyType = (
  propertyType: PropertyType,
) => {
  const recurseOneOf = (oneOf: PropertyValues[]) => {
    const propertyTypeIds: VersionedUri[] = [];

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
  const propertyTypeIds: VersionedUri[] = [];
  const entityTypeIds: VersionedUri[] = [];

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
  propertyTypeId: VersionedUri,
  propertyTypeMap: Record<
    VersionedUri,
    { schema: PropertyType; created: boolean }
  >,
  user: User,
) => {
  const record = propertyTypeMap[propertyTypeId]!;

  const createdPropertyTypes: OntologyElementMetadata[] = [];

  if (!record.created) {
    const { propertyTypeIds } = getReferencedIdsFromPropertyType(record.schema);

    for (const referencedPropertyTypeId of propertyTypeIds) {
      const { createdPropertyTypes: newCreatedPropertyTypes } =
        await createPropertyTypeTree(
          graphApi,
          referencedPropertyTypeId,
          propertyTypeMap,
          user,
        );

      createdPropertyTypes.push(...newCreatedPropertyTypes);
    }
  }
  if (!record.created) {
    createdPropertyTypes.push(
      (
        await graphApi.createPropertyType({
          ownedById: user.accountId as OwnedById,
          actorId: user.accountId,
          schema: record.schema,
        })
      ).data,
    );

    record.created = true;
  }

  return { createdPropertyTypes };
};

export const createEntityTypeTree = async (
  graphApi: GraphApi,
  entityTypeId: VersionedUri,
  entityTypeMap: Record<VersionedUri, { schema: EntityType; created: boolean }>,
  propertyTypeMap: Record<
    VersionedUri,
    { schema: PropertyType; created: boolean }
  >,
  user: User,
) => {
  const record = entityTypeMap[entityTypeId]!;

  const createdPropertyTypes: OntologyElementMetadata[] = [];
  const createdEntityTypes: OntologyElementMetadata[] = [];

  if (!record.created) {
    const { propertyTypeIds, entityTypeIds } = getReferencedIdsFromEntityType(
      record.schema,
    );

    for (const referencedPropertyTypeId of propertyTypeIds) {
      const { createdPropertyTypes: newCreatedPropertyTypes } =
        await createPropertyTypeTree(
          graphApi,
          referencedPropertyTypeId,
          propertyTypeMap,
          user,
        );

      createdPropertyTypes.push(...newCreatedPropertyTypes);
    }

    for (const referencedEntityTypeId of entityTypeIds) {
      const {
        createdPropertyTypes: newCreatedPropertyTypes,
        createdEntityTypes: newCreatedEntityTypes,
      } = await createEntityTypeTree(
        graphApi,
        referencedEntityTypeId,
        entityTypeMap,
        propertyTypeMap,
        user,
      );

      createdPropertyTypes.push(...newCreatedPropertyTypes);
      createdEntityTypes.push(...newCreatedEntityTypes);
    }
  }
  if (!record.created) {
    createdEntityTypes.push(
      (
        await graphApi.createEntityType({
          ownedById: user.accountId as OwnedById,
          actorId: user.accountId,
          schema: record.schema,
        })
      ).data,
    );

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
 */
const traverseJsonValue = ({
  key,
  jsonValue,
  streamKeyMap,
  streamName,
  integration,
  namespace,
}: {
  key: string | undefined;
  jsonValue: JsonValue;
  streamKeyMap: Record<string, PropertyType>;
  streamName: string;
  integration: string;
  namespace: string;
}) => {
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
    const properties: Record<BaseUri, ValueOrArray<PropertyTypeReference>> = {};

    for (const [innerKey, innerVal] of typedEntries(jsonValue)) {
      const innerPropertyValue = traverseJsonValue({
        key: innerKey,
        jsonValue: innerVal,
        streamKeyMap,
        streamName,
        integration,
        namespace,
      });
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
          namespace,
          kind: "property-type",
          title: key,
          slugOverride: `generated-${integration}-${streamName}-${encodeURIComponent(
            key,
          )}`,
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
  namespace: string,
): { entityProperties: PropertyObject; entityType: EntityType } => {
  const title = streamNameToEntityTypeName(integration, streamName);

  const entityType: EntityType = existingEntityType ?? {
    $id: generateTypeId({
      namespace,
      kind: "entity-type",
      title,
      slugOverride: `generated-${integration}-${streamName}`,
    }),
    kind: "entityType",
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
        });

        propertyType = streamKeyMap[key];
        if (!propertyType) {
          throw new Error(`Missing property type for key: ${key}`);
        }

        addOrUpdatePropertyTypeToEntityType(entityType, propertyType, true);
      }
      entityProperties[extractBaseUri(propertyType?.$id!)] = jsonValue;
      delete entityProperties[key];
    } else {
      traverseJsonValue({
        key,
        jsonValue,
        streamKeyMap,
        streamName,
        integration,
        namespace,
      });

      const propertyType = streamKeyMap[key];
      if (!propertyType) {
        throw new Error(`Missing property type for key: ${key}`);
      }

      addOrUpdatePropertyTypeToEntityType(entityType, propertyType, false);

      entityProperties[extractBaseUri(propertyType.$id)] = jsonValue;
      delete entityProperties[key];
    }
  }

  return { entityProperties, entityType };
};
/* eslint-enable no-param-reassign */
