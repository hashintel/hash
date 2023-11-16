/* eslint-disable no-param-reassign */
import { extractVersion, VersionedUrl } from "@blockprotocol/type-system";
import { SchemaKind } from "@local/hash-isomorphic-utils/ontology-types";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";
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
  generateSystemEntityTypeSchema,
  generateSystemPropertyTypeSchema,
  getOrCreateOwningAccountGroupId,
  isSelfHostedInstance,
  LinkDestinationConstraint,
  PrimitiveDataTypeKey,
} from "../util";
import { MigrationState } from "./types";

const systemTypeDomain = "https://hash.ai";

const systemTypeWebShortname = "hash";

const generateSystemTypeBaseUrl = ({
  kind,
  title,
}: {
  kind: SchemaKind;
  title: string;
}): BaseUrl =>
  `${systemTypeDomain}/@${systemTypeWebShortname}/types/${kind}/${slugifyTypeTitle(
    title,
  )}/` as const as BaseUrl;

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

export const createSystemPropertyTypeIfNotExists: ImpureGraphFunction<
  {
    propertyTypeDefinition: {
      title: string;
      description?: string;
      possibleValues: {
        primitiveDataType?: PrimitiveDataTypeKey;
        propertyTypeObjectProperties?: {
          [_ in string]: { $ref: VersionedUrl };
        };
        array?: boolean;
      }[];
    };
    migrationState: MigrationState;
  },
  Promise<PropertyTypeWithMetadata>
> = async (
  context,
  authentication,
  { propertyTypeDefinition, migrationState },
) => {
  const { title } = propertyTypeDefinition;
  const baseUrl = generateSystemTypeBaseUrl({ kind: "property-type", title });

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
      systemTypeWebShortname,
    );
    const createdPropertyType = await createPropertyType(
      context,
      authentication,
      {
        ownedById: accountGroupId as OwnedById,
        schema: propertyTypeSchema,
        webShortname: systemTypeWebShortname,
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

export const createSystemEntityTypeIfNotExists: ImpureGraphFunction<
  {
    entityTypeDefinition: {
      allOf?: VersionedUrl[];
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
    migrationState: MigrationState;
  },
  Promise<EntityTypeWithMetadata>
> = async (
  context,
  authentication,
  { entityTypeDefinition, migrationState },
) => {
  const { title } = entityTypeDefinition;
  const baseUrl = generateSystemTypeBaseUrl({ kind: "entity-type", title });

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
      systemTypeWebShortname,
    );
    const createdEntityType = await createEntityType(context, authentication, {
      ownedById: accountGroupId as OwnedById,
      schema: entityTypeSchema,
      webShortname: systemTypeWebShortname,
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
