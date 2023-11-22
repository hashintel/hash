/* eslint-disable no-param-reassign */
import {
  Array,
  DataTypeReference,
  ENTITY_TYPE_META_SCHEMA,
  EntityType,
  extractVersion,
  Object as ObjectSchema,
  OneOf,
  PROPERTY_TYPE_META_SCHEMA,
  PropertyType,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  generateTypeBaseUrl,
  SchemaKind,
  SystemTypeWebShortname,
} from "@local/hash-isomorphic-utils/ontology-types";
import {
  BaseUrl,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import {
  extractBaseUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/type-system-patch";

import { NotFoundError } from "../../lib/error";
import { ImpureGraphFunction } from "../context-types";
import { getDataTypeById } from "../ontology/primitive/data-type";
import {
  createEntityType,
  getEntityTypeById,
  modifyEntityTypeAuthorizationRelationships,
} from "../ontology/primitive/entity-type";
import {
  createPropertyType,
  getPropertyTypeById,
  modifyPropertyTypeAuthorizationRelationships,
} from "../ontology/primitive/property-type";
import { systemAccountId } from "../system-account";
import {
  getOrCreateOwningAccountGroupId,
  isSelfHostedInstance,
  PrimitiveDataTypeKey,
} from "../util";
import { MigrationState } from "./types";

const systemTypeDomain = "https://hash.ai";

const generateSystemTypeBaseUrl = ({
  kind,
  title,
  shortname,
}: {
  kind: SchemaKind;
  title: string;
  shortname: SystemTypeWebShortname;
}): BaseUrl =>
  generateTypeBaseUrl({
    kind,
    title,
    webShortname: shortname,
    domain: systemTypeDomain,
  });

export const loadExternalDataTypeIfNotExists: ImpureGraphFunction<
  {
    dataTypeId: VersionedUrl;
    migrationState: MigrationState;
  },
  Promise<DataTypeWithMetadata>
> = async (context, authentication, { dataTypeId, migrationState }) => {
  const baseUrl = extractBaseUrl(dataTypeId);
  const versionNumber = extractVersion(dataTypeId);

  migrationState.dataTypeVersions[baseUrl] = versionNumber;

  const existingDataType = await getDataTypeById(context, authentication, {
    dataTypeId,
  }).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingDataType) {
    return existingDataType;
  }

  await context.graphApi.loadExternalDataType(authentication.actorId, {
    dataTypeId,
  });

  return await getDataTypeById(context, authentication, { dataTypeId });
};

export const loadExternalPropertyTypeIfNotExists: ImpureGraphFunction<
  {
    propertyTypeId: VersionedUrl;
    migrationState: MigrationState;
  },
  Promise<PropertyTypeWithMetadata>
> = async (context, authentication, { propertyTypeId, migrationState }) => {
  const baseUrl = extractBaseUrl(propertyTypeId);
  const versionNumber = extractVersion(propertyTypeId);

  migrationState.propertyTypeVersions[baseUrl] = versionNumber;

  const existingPropertyType = await getPropertyTypeById(
    context,
    authentication,
    {
      propertyTypeId,
    },
  ).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingPropertyType) {
    return existingPropertyType;
  }

  await context.graphApi.loadExternalPropertyType(authentication.actorId, {
    propertyTypeId,
  });

  return await getPropertyTypeById(context, authentication, { propertyTypeId });
};

export const loadExternalEntityTypeIfNotExists: ImpureGraphFunction<
  {
    entityTypeId: VersionedUrl;
    migrationState: MigrationState;
  },
  Promise<EntityTypeWithMetadata>
> = async (context, authentication, { entityTypeId, migrationState }) => {
  const baseUrl = extractBaseUrl(entityTypeId);
  const versionNumber = extractVersion(entityTypeId);

  migrationState.propertyTypeVersions[baseUrl] = versionNumber;

  const existingEntityType = await getEntityTypeById(context, authentication, {
    entityTypeId,
  }).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingEntityType) {
    return existingEntityType;
  }

  await context.graphApi.loadExternalEntityType(authentication.actorId, {
    entityTypeId,
  });

  return await getEntityTypeById(context, authentication, { entityTypeId });
};

type PropertyTypeDefinition = {
  propertyTypeId: VersionedUrl;
  title: string;
  description?: string;
  possibleValues: {
    primitiveDataType?: PrimitiveDataTypeKey;
    propertyTypeObjectProperties?: { [_ in string]: { $ref: VersionedUrl } };
    array?: boolean;
  }[];
};

/**
 * Helper method for generating a property type schema for the Graph API.
 */
export const generateSystemPropertyTypeSchema = (
  params: PropertyTypeDefinition,
): PropertyType => {
  const possibleValues: PropertyValues[] = params.possibleValues.map(
    ({ array, primitiveDataType, propertyTypeObjectProperties }) => {
      let inner: PropertyValues;

      if (primitiveDataType) {
        const dataTypeReference: DataTypeReference = {
          $ref: blockProtocolDataTypes[primitiveDataType].dataTypeId,
        };
        inner = dataTypeReference;
      } else if (propertyTypeObjectProperties) {
        const propertyTypeObject: ObjectSchema<
          ValueOrArray<PropertyTypeReference>
        > = {
          type: "object" as const,
          properties: propertyTypeObjectProperties,
        };
        inner = propertyTypeObject;
      } else {
        throw new Error(
          "Please provide either a primitiveDataType or propertyTypeObjectProperties to generateSystemPropertyTypeSchema",
        );
      }

      // Optionally wrap inner in an array
      if (array) {
        const arrayOfPropertyValues: Array<OneOf<PropertyValues>> = {
          type: "array",
          items: {
            oneOf: [inner],
          },
        };
        return arrayOfPropertyValues;
      } else {
        return inner;
      }
    },
  );

  return {
    $schema: PROPERTY_TYPE_META_SCHEMA,
    kind: "propertyType",
    $id: params.propertyTypeId,
    title: params.title,
    description: params.description,
    oneOf: possibleValues as [PropertyValues, ...PropertyValues[]],
  };
};

type BaseCreateTypeIfNotExistsParameters = {
  webShortname: SystemTypeWebShortname;
  migrationState: MigrationState;
};

export const createSystemPropertyTypeIfNotExists: ImpureGraphFunction<
  {
    propertyTypeDefinition: Omit<PropertyTypeDefinition, "propertyTypeId">;
  } & BaseCreateTypeIfNotExistsParameters,
  Promise<PropertyTypeWithMetadata>
> = async (
  context,
  authentication,
  { propertyTypeDefinition, migrationState, webShortname },
) => {
  const { title } = propertyTypeDefinition;
  const baseUrl = generateSystemTypeBaseUrl({
    kind: "property-type",
    title,
    shortname: webShortname,
  });

  const versionNumber = 1;

  const propertyTypeId = versionedUrlFromComponents(baseUrl, versionNumber);

  migrationState.propertyTypeVersions[baseUrl] = versionNumber;

  const existingPropertyType = await getPropertyTypeById(
    context,
    authentication,
    { propertyTypeId },
  ).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingPropertyType) {
    return existingPropertyType;
  }

  const propertyTypeSchema = generateSystemPropertyTypeSchema({
    ...propertyTypeDefinition,
    propertyTypeId,
  });

  if (isSelfHostedInstance) {
    // If this is a self-hosted instance, the system types will be created as external types without an in-instance web
    await context.graphApi.loadExternalPropertyType(authentication.actorId, {
      // Specify the schema so that self-hosted instances don't need network access to hash.ai
      schema: propertyTypeSchema,
    });

    return await getPropertyTypeById(context, authentication, {
      propertyTypeId: propertyTypeSchema.$id,
    });
  } else {
    // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we need a web for system types to belong to
    const accountGroupId = await getOrCreateOwningAccountGroupId(
      context,
      webShortname,
    );
    const createdPropertyType = await createPropertyType(
      context,
      authentication,
      {
        ownedById: accountGroupId as OwnedById,
        schema: propertyTypeSchema,
        webShortname,
      },
    ).catch((createError) => {
      // logger.warn(`Failed to create property type: ${propertyTypeId}`);
      throw createError;
    });

    // We don't want anyone but the systemAccount being able to modify system types
    await modifyPropertyTypeAuthorizationRelationships(
      context,
      authentication,
      [
        {
          operation: "delete",
          relationship: {
            relation: "owner",
            resource: {
              kind: "propertyType",
              resourceId: createdPropertyType.schema.$id,
            },
            subject: {
              kind: "accountGroup",
              subjectId: accountGroupId,
            },
          },
        },
        {
          operation: "create",
          relationship: {
            relation: "owner",
            resource: {
              kind: "propertyType",
              resourceId: createdPropertyType.schema.$id,
            },
            subject: {
              kind: "account",
              subjectId: systemAccountId,
            },
          },
        },
      ],
    );

    return createdPropertyType;
  }
};

type LinkDestinationConstraint =
  | EntityTypeWithMetadata
  | VersionedUrl
  // Some models may reference themselves. This marker is used to stop infinite loops during initialization by telling the initializer to use a self reference
  | "SELF_REFERENCE";

export type EntityTypeDefinition = {
  allOf?: VersionedUrl[];
  entityTypeId: VersionedUrl;
  title: string;
  description?: string;
  properties?: {
    propertyType: PropertyTypeWithMetadata | VersionedUrl;
    required?: boolean;
    array?: { minItems?: number; maxItems?: number } | boolean;
  }[];
  outgoingLinks?: {
    linkEntityType: EntityTypeWithMetadata | VersionedUrl;
    destinationEntityTypes?: [
      LinkDestinationConstraint,
      ...LinkDestinationConstraint[],
    ];
    minItems?: number;
    maxItems?: number;
    ordered?: boolean;
  }[];
};

/**
 * Helper method for generating an entity type schema for the Graph API.
 */
export const generateSystemEntityTypeSchema = (
  params: EntityTypeDefinition,
): EntityType => {
  /** @todo - clean this up to be more readable: https://app.asana.com/0/1202805690238892/1202931031833226/f */
  const properties =
    params.properties?.reduce(
      (prev, { propertyType, array }) => ({
        ...prev,
        [typeof propertyType === "object"
          ? propertyType.metadata.recordId.baseUrl
          : extractBaseUrl(propertyType)]: array
          ? {
              type: "array",
              items: {
                $ref:
                  typeof propertyType === "object"
                    ? propertyType.schema.$id
                    : propertyType,
              },
              ...(array === true ? {} : array),
            }
          : {
              $ref:
                typeof propertyType === "object"
                  ? propertyType.schema.$id
                  : propertyType,
            },
      }),
      {},
    ) ?? {};

  const requiredProperties = params.properties
    ?.filter(({ required }) => !!required)
    .map(({ propertyType }) =>
      typeof propertyType === "object"
        ? propertyType.metadata.recordId.baseUrl
        : extractBaseUrl(propertyType),
    );

  const links =
    params.outgoingLinks?.reduce<EntityType["links"]>(
      (
        prev,
        {
          linkEntityType,
          destinationEntityTypes,
          ordered = false,
          minItems,
          maxItems,
        },
      ): EntityType["links"] => ({
        ...prev,
        [typeof linkEntityType === "object"
          ? linkEntityType.schema.$id
          : linkEntityType]: {
          type: "array",
          ordered,
          items: destinationEntityTypes
            ? {
                oneOf: destinationEntityTypes.map(
                  (entityTypeIdOrReference) => ({
                    $ref:
                      entityTypeIdOrReference === "SELF_REFERENCE"
                        ? params.entityTypeId
                        : typeof entityTypeIdOrReference === "object"
                        ? entityTypeIdOrReference.schema.$id
                        : entityTypeIdOrReference,
                  }),
                ),
              }
            : {},
          minItems,
          maxItems,
        },
      }),
      {},
    ) ?? undefined;

  const allOf = params.allOf?.map((url) => ({ $ref: url }));

  return {
    $schema: ENTITY_TYPE_META_SCHEMA,
    kind: "entityType",
    $id: params.entityTypeId,
    allOf,
    title: params.title,
    description: params.description,
    type: "object",
    properties,
    required: requiredProperties,
    links,
  };
};

export const createSystemEntityTypeIfNotExists: ImpureGraphFunction<
  {
    entityTypeDefinition: Omit<EntityTypeDefinition, "entityTypeId">;
  } & BaseCreateTypeIfNotExistsParameters,
  Promise<EntityTypeWithMetadata>
> = async (
  context,
  authentication,
  { entityTypeDefinition, migrationState, webShortname },
) => {
  const { title } = entityTypeDefinition;
  const baseUrl = generateSystemTypeBaseUrl({
    kind: "entity-type",
    title,
    shortname: webShortname,
  });

  const versionNumber = 1;

  const entityTypeId = versionedUrlFromComponents(baseUrl, versionNumber);

  migrationState.entityTypeVersions[baseUrl] = versionNumber;

  const existingEntityType = await getEntityTypeById(context, authentication, {
    entityTypeId,
  }).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingEntityType) {
    return existingEntityType;
  }

  const entityTypeSchema = generateSystemEntityTypeSchema({
    ...entityTypeDefinition,
    entityTypeId,
  });

  // The type was missing, try and create it
  if (isSelfHostedInstance) {
    // If this is a self-hosted instance, the system types will be created as external types without an in-instance web
    await context.graphApi.loadExternalEntityType(systemAccountId, {
      // Specify the schema so that self-hosted instances don't need network access to hash.ai
      schema: entityTypeSchema,
    });

    return await getEntityTypeById(context, authentication, {
      entityTypeId: entityTypeSchema.$id,
    });
  } else {
    // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we need a web for system types to belong to
    const accountGroupId = await getOrCreateOwningAccountGroupId(
      context,
      webShortname,
    );
    const createdEntityType = await createEntityType(context, authentication, {
      ownedById: accountGroupId as OwnedById,
      schema: entityTypeSchema,
      webShortname,
      instantiators: [],
    }).catch((createError) => {
      // logger.warn(`Failed to create entity type: ${entityTypeSchema.$id}`);
      throw createError;
    });

    await modifyEntityTypeAuthorizationRelationships(context, authentication, [
      {
        operation: "delete",
        relationship: {
          relation: "owner",
          resource: {
            kind: "entityType",
            resourceId: createdEntityType.schema.$id,
          },
          subject: {
            kind: "accountGroup",
            subjectId: accountGroupId,
          },
        },
      },
      {
        operation: "create",
        relationship: {
          relation: "owner",
          resource: {
            kind: "entityType",
            resourceId: createdEntityType.schema.$id,
          },
          subject: {
            kind: "account",
            subjectId: systemAccountId,
          },
        },
      },
      {
        operation: "create",
        relationship: {
          resource: {
            kind: "entityType",
            resourceId: createdEntityType.schema.$id,
          },
          relation: "instantiator",
          subject: {
            kind: "public",
          },
        },
      },
    ]);

    return createdEntityType;
  }
};
