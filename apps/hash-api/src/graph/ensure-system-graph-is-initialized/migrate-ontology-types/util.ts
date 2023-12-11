/* eslint-disable no-param-reassign */
import fs from "node:fs";
import path from "node:path";

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
import { UpdateEntityType, UpdatePropertyType } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  generateTypeBaseUrl,
  SchemaKind,
  SystemTypeWebShortname,
} from "@local/hash-isomorphic-utils/ontology-types";
import {
  BaseUrl,
  DataTypeWithMetadata,
  Entity,
  EntityRootType,
  EntityTypeRelationAndSubject,
  EntityTypeWithMetadata,
  OwnedById,
  PropertyTypeRelationAndSubject,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import {
  componentsFromVersionedUrl,
  extractBaseUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/src/shared/type-system-patch";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/src/stdlib/subgraph/roots";

import { NotFoundError } from "../../../lib/error";
import {
  CACHED_DATA_TYPE_SCHEMAS,
  CACHED_ENTITY_TYPE_SCHEMAS,
  CACHED_PROPERTY_TYPE_SCHEMAS,
} from "../../../seed-data";
import { ImpureGraphFunction } from "../../context-types";
import { getDataTypeById } from "../../ontology/primitive/data-type";
import {
  createEntityType,
  getEntityTypeById,
} from "../../ontology/primitive/entity-type";
import {
  createPropertyType,
  getPropertyTypeById,
} from "../../ontology/primitive/property-type";
import {
  getOrCreateOwningAccountGroupId,
  isSelfHostedInstance,
  PrimitiveDataTypeKey,
} from "../system-webs-and-entities";
import { MigrationState } from "./types";
import { upgradeEntityTypeDependencies } from "./util/upgrade-entity-type-dependencies";

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

  const cached_file_name = CACHED_DATA_TYPE_SCHEMAS[dataTypeId];
  if (cached_file_name) {
    // We need an absolute path to `../../../seed-data`
    await context.graphApi.loadExternalDataType(authentication.actorId, {
      schema: JSON.parse(
        fs.readFileSync(
          path.join(
            __dirname,
            "..",
            "..",
            "seed-data",
            "data_type",
            cached_file_name,
          ),
          "utf8",
        ),
      ),
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    });

    return await getDataTypeById(context, authentication, { dataTypeId });
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

  const cached_file_name = CACHED_PROPERTY_TYPE_SCHEMAS[propertyTypeId];
  if (cached_file_name) {
    // We need an absolute path to `../../../seed-data`
    await context.graphApi.loadExternalPropertyType(authentication.actorId, {
      schema: JSON.parse(
        fs.readFileSync(
          path.join(
            __dirname,
            "..",
            "..",
            "seed-data",
            "property_type",
            cached_file_name,
          ),
          "utf8",
        ),
      ),
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    });

    return await getPropertyTypeById(context, authentication, {
      propertyTypeId,
    });
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

  const cached_file_name = CACHED_ENTITY_TYPE_SCHEMAS[entityTypeId];
  if (cached_file_name) {
    // We need an absolute path to `../../../seed-data`
    await context.graphApi.loadExternalEntityType(authentication.actorId, {
      schema: JSON.parse(
        fs.readFileSync(
          path.join(
            __dirname,
            "..",
            "..",
            "seed-data",
            "entity_type",
            cached_file_name,
          ),
          "utf8",
        ),
      ),
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
        {
          relation: "instantiator",
          subject: {
            kind: "public",
          },
        },
      ],
    });

    return await getEntityTypeById(context, authentication, { entityTypeId });
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

  const relationships: PropertyTypeRelationAndSubject[] = [
    {
      relation: "editor",
      subject: {
        kind: "account",
        subjectId: systemAccountId,
      },
    },
    {
      relation: "viewer",
      subject: {
        kind: "public",
      },
    },
  ];

  if (isSelfHostedInstance) {
    const { machineActorId } = await getOrCreateOwningAccountGroupId(
      context,
      webShortname,
    );

    /**
     * If this is a self-hosted instance, the system types will be created as external types that don't belong to an in-instance web,
     * although they will be created by a machine actor associated with an equivalently named web.
     */
    await context.graphApi.loadExternalPropertyType(machineActorId, {
      // Specify the schema so that self-hosted instances don't need network access to hash.ai
      schema: propertyTypeSchema,
      relationships,
    });

    return await getPropertyTypeById(context, authentication, {
      propertyTypeId: propertyTypeSchema.$id,
    });
  } else {
    // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we need a web for system types to belong to
    const { accountGroupId, machineActorId } =
      await getOrCreateOwningAccountGroupId(context, webShortname);

    const createdPropertyType = await createPropertyType(
      context,
      { actorId: machineActorId },
      {
        ownedById: accountGroupId as OwnedById,
        schema: propertyTypeSchema,
        webShortname,
        relationships,
      },
    ).catch((createError) => {
      // logger.warn(`Failed to create property type: ${propertyTypeId}`);
      throw createError;
    });

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

  const relationships: EntityTypeRelationAndSubject[] = [
    {
      relation: "editor",
      subject: {
        kind: "account",
        subjectId: systemAccountId,
      },
    },
    {
      relation: "viewer",
      subject: {
        kind: "public",
      },
    },
    {
      relation: "instantiator",
      subject: {
        kind: "public",
      },
    },
  ];

  // The type was missing, try and create it
  if (isSelfHostedInstance) {
    const { machineActorId } = await getOrCreateOwningAccountGroupId(
      context,
      webShortname,
    );

    /**
     * If this is a self-hosted instance, the system types will be created as external types that don't belong to an in-instance web,
     * although they will be created by a machine actor associated with an equivalently named web.
     */
    await context.graphApi.loadExternalEntityType(machineActorId, {
      // Specify the schema so that self-hosted instances don't need network access to hash.ai
      schema: entityTypeSchema,
      relationships,
    });

    return await getEntityTypeById(context, authentication, {
      entityTypeId: entityTypeSchema.$id,
    });
  } else {
    // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we need a web for system types to belong to
    const { accountGroupId, machineActorId } =
      await getOrCreateOwningAccountGroupId(context, webShortname);

    const createdEntityType = await createEntityType(
      context,
      { actorId: machineActorId },
      {
        ownedById: accountGroupId as OwnedById,
        schema: entityTypeSchema,
        webShortname,
        relationships,
      },
    ).catch((createError) => {
      // logger.warn(`Failed to create entity type: ${entityTypeSchema.$id}`);
      throw createError;
    });

    return createdEntityType;
  }
};

export const getExistingHashSystemEntityTypeId = ({
  entityTypeKey,
  migrationState,
}: {
  entityTypeKey: keyof typeof systemEntityTypes;
  migrationState: MigrationState;
}) => {
  const entityTypeBaseUrl = systemEntityTypes[entityTypeKey]
    .entityTypeBaseUrl as BaseUrl;

  const entityTypeVersion =
    migrationState.entityTypeVersions[entityTypeBaseUrl];

  if (typeof entityTypeVersion === "undefined") {
    throw new Error(
      `Expected '${entityTypeKey}' entity type to have been seeded`,
    );
  }

  return versionedUrlFromComponents(entityTypeBaseUrl, entityTypeVersion);
};

export const getExistingHashLinkEntityTypeId = ({
  linkEntityTypeKey,
  migrationState,
}: {
  linkEntityTypeKey: keyof typeof systemLinkEntityTypes;
  migrationState: MigrationState;
}) => {
  const linkEntityTypeBaseUrl = systemLinkEntityTypes[linkEntityTypeKey]
    .linkEntityTypeBaseUrl as BaseUrl;

  const linkEntityTypeVersion =
    migrationState.entityTypeVersions[linkEntityTypeBaseUrl];

  if (typeof linkEntityTypeVersion === "undefined") {
    throw new Error(
      `Expected '${linkEntityTypeKey}' link entity type to have been seeded`,
    );
  }

  return versionedUrlFromComponents(
    linkEntityTypeBaseUrl,
    linkEntityTypeVersion,
  );
};

export const getExistingHashPropertyTypeId = ({
  propertyTypeKey,
  migrationState,
}: {
  propertyTypeKey: keyof typeof systemPropertyTypes;
  migrationState: MigrationState;
}) => {
  const propertyTypeBaseUrl = systemPropertyTypes[propertyTypeKey]
    .propertyTypeBaseUrl as BaseUrl;

  const propertyTypeVersion =
    migrationState.propertyTypeVersions[propertyTypeBaseUrl];

  if (typeof propertyTypeVersion === "undefined") {
    throw new Error(
      `Expected '${propertyTypeKey}' property type to have been seeded`,
    );
  }

  return versionedUrlFromComponents(propertyTypeBaseUrl, propertyTypeVersion);
};

type BaseUpdateTypeParameters = {
  migrationState: MigrationState;
};

export const updateSystemEntityType: ImpureGraphFunction<
  {
    updateExistingEntitiesToNewVersion: boolean;
    currentEntityTypeId: VersionedUrl;
    newSchema: UpdateEntityType;
  } & BaseUpdateTypeParameters,
  Promise<{ updatedEntityTypeId: VersionedUrl }>
> = async (
  context,
  authentication,
  {
    currentEntityTypeId,
    newSchema,
    migrationState,
    updateExistingEntitiesToNewVersion,
  },
) => {
  const { baseUrl, version } = componentsFromVersionedUrl(currentEntityTypeId);

  const versionInMigrationState = migrationState.entityTypeVersions[baseUrl];

  if (!versionInMigrationState) {
    throw new Error(
      `Update requested for entity type with current entityTypeId ${currentEntityTypeId}, but it does not exist in migration state.`,
    );
  }

  if (versionInMigrationState !== version) {
    throw new Error(
      `Update requested for entity type with current entityTypeId ${currentEntityTypeId}, but the current version in migration state is ${versionInMigrationState}`,
    );
  }

  const nextVersion = version + 1;

  const updatedEntityTypeId = versionedUrlFromComponents(baseUrl, nextVersion);

  const entityTypeSchema = {
    ...newSchema,
    $id: updatedEntityTypeId,
  };

  await context.graphApi.updateEntityType(authentication.actorId, {
    typeToUpdate: currentEntityTypeId,
    schema: entityTypeSchema,
  });

  migrationState.entityTypeVersions[baseUrl] = nextVersion;

  if (updateExistingEntitiesToNewVersion) {
    // @todo figure out how to manage permissions for updating entities
    //   – the account doing the migration needs to be able to (a) find and (b) update them
  }

  return { updatedEntityTypeId };
};

export const updateSystemPropertyType: ImpureGraphFunction<
  {
    currentPropertyTypeId: VersionedUrl;
    newSchema: UpdatePropertyType;
  } & BaseUpdateTypeParameters,
  Promise<{ updatedPropertyTypeId: VersionedUrl }>
> = async (
  context,
  authentication,
  { currentPropertyTypeId, newSchema, migrationState },
) => {
  const { baseUrl, version } = componentsFromVersionedUrl(
    currentPropertyTypeId,
  );

  const versionInMigrationState = migrationState.propertyTypeVersions[baseUrl];

  if (!versionInMigrationState) {
    throw new Error(
      `Update requested for property type with current propertyTypeId ${currentPropertyTypeId}, but it does not exist in migration state.`,
    );
  }

  if (versionInMigrationState !== version) {
    throw new Error(
      `Update requested for property type with current propertyTypeId ${currentPropertyTypeId}, but the current version in migration state is ${versionInMigrationState}`,
    );
  }

  const nextVersion = version + 1;

  const updatedPropertyTypeId = versionedUrlFromComponents(
    baseUrl,
    nextVersion,
  );

  const propertyTypeSchema = {
    ...newSchema,
    $id: updatedPropertyTypeId,
  };

  await context.graphApi.updatePropertyType(authentication.actorId, {
    typeToUpdate: currentPropertyTypeId,
    schema: propertyTypeSchema,
  });

  migrationState.propertyTypeVersions[baseUrl] = nextVersion;

  return { updatedPropertyTypeId };
};

/**
 * Given a list of upgradedEntityTypeIds, and the keys of types which refer to them, update those types to refer to the new versions.
 *
 * @todo have some way of automatically checking all existing types for references to the upgraded types, avoid manually specifying them
 */
export const upgradeDependenciesInHashEntityType: ImpureGraphFunction<
  {
    dependentEntityTypeKeys: (keyof typeof systemEntityTypes)[];
    updateExistingEntitiesToNewVersion: boolean;
    upgradedEntityTypeIds: VersionedUrl[];
  } & BaseUpdateTypeParameters,
  Promise<void>
> = async (
  context,
  authentication,
  {
    dependentEntityTypeKeys,
    migrationState,
    updateExistingEntitiesToNewVersion,
    upgradedEntityTypeIds,
  },
) => {
  for (const dependentEntityTypeKey of dependentEntityTypeKeys) {
    const currentDependentEntityTypeId = getExistingHashSystemEntityTypeId({
      entityTypeKey: dependentEntityTypeKey,
      migrationState,
    });

    const { schema: dependentSchema } = await getEntityTypeById(
      context,
      authentication,
      {
        entityTypeId: currentDependentEntityTypeId,
      },
    );

    const newDependentSchema = upgradeEntityTypeDependencies({
      schema: dependentSchema,
      upgradedEntityTypeIds,
    });

    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentDependentEntityTypeId,
      migrationState,
      newSchema: newDependentSchema,
      updateExistingEntitiesToNewVersion,
    });

    /**
     * @todo handle cascading updates – some of the updated system types may themselves be dependencies of other types
     * ideally we'd have a function to check all existing types for dependencies and update them
     * would also need to handle circular references as part of this
     */
  }
};

export const getEntitiesByType: ImpureGraphFunction<
  { entityTypeId: VersionedUrl },
  Promise<Entity[]>
> = async (context, authentication, { entityTypeId }) => {
  return await context.graphApi
    .getEntitiesByQuery(authentication.actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(entityTypeId, {
            ignoreParents: true,
          }),
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then((resp) =>
      getRoots(mapGraphApiSubgraphToSubgraph<EntityRootType>(resp.data)),
    );
};
