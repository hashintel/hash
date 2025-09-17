/* eslint-disable no-param-reassign */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BaseUrl,
  Conversions,
  DataType,
  DataTypeMetadata,
  DataTypeReference,
  DataTypeWithMetadata,
  Entity,
  EntityType,
  EntityTypeWithMetadata,
  OneOfSchema,
  OntologyTypeRecordId,
  PropertyObjectWithMetadata,
  PropertyType,
  PropertyTypeReference,
  PropertyTypeWithMetadata,
  PropertyValueArray,
  PropertyValueObject,
  PropertyValues,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  atLeastOne,
  componentsFromVersionedUrl,
  DATA_TYPE_META_SCHEMA,
  ENTITY_TYPE_META_SCHEMA,
  extractBaseUrl,
  extractWebIdFromEntityId,
  incrementOntologyTypeVersion,
  makeOntologyTypeVersion,
  PROPERTY_TYPE_META_SCHEMA,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import type { UpdatePropertyType } from "@local/hash-graph-client";
import { getDataTypeById } from "@local/hash-graph-sdk/data-type";
import type { ConstructDataTypeParams } from "@local/hash-graph-sdk/ontology";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import {
  blockProtocolDataTypes,
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  SchemaKind,
  SystemTypeWebShortname,
} from "@local/hash-isomorphic-utils/ontology-types";
import {
  generateLinkMapWithConsistentSelfReferences,
  generateTypeBaseUrl,
} from "@local/hash-isomorphic-utils/ontology-types";

import type { ImpureGraphFunction } from "../../context-types";
import { getEntities } from "../../knowledge/primitive/entity";
import { createDataType } from "../../ontology/primitive/data-type";
import {
  createEntityType,
  getEntityTypeById,
} from "../../ontology/primitive/entity-type";
import {
  createPropertyType,
  getPropertyTypeById,
} from "../../ontology/primitive/property-type";
import type { PrimitiveDataTypeKey } from "../system-webs-and-entities";
import { getOrCreateOwningWebId } from "../system-webs-and-entities";
import type { MigrationState } from "./types";
import { upgradeWebEntities } from "./util/upgrade-entities";
import { upgradeEntityTypeDependencies } from "./util/upgrade-entity-type-dependencies";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const systemTypeDomain = "https://hash.ai";

export const generateSystemTypeBaseUrl = ({
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

export type PropertyTypeDefinition = {
  propertyTypeId: VersionedUrl;
  title: string;
  description: string;
  possibleValues: {
    dataTypeId?: VersionedUrl;
    primitiveDataType?: PrimitiveDataTypeKey;
    propertyTypeObjectProperties?: Record<
      string,
      ValueOrArray<PropertyTypeReference>
    >;
    propertyTypeObjectRequiredProperties?: BaseUrl[];
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
    ({
      array,
      dataTypeId,
      primitiveDataType,
      propertyTypeObjectProperties,
      propertyTypeObjectRequiredProperties,
    }) => {
      let inner: PropertyValues;

      if (dataTypeId) {
        const dataTypeReference: DataTypeReference = {
          $ref: dataTypeId,
        };
        inner = dataTypeReference;
      } else if (primitiveDataType) {
        const dataTypeReference: DataTypeReference = {
          $ref: blockProtocolDataTypes[primitiveDataType].dataTypeId,
        };
        inner = dataTypeReference;
      } else if (propertyTypeObjectProperties) {
        const propertyTypeObject: PropertyValueObject<
          ValueOrArray<PropertyTypeReference>
        > = {
          type: "object" as const,
          properties: propertyTypeObjectProperties,
          required: propertyTypeObjectRequiredProperties
            ? atLeastOne(propertyTypeObjectRequiredProperties)
            : undefined,
        };
        inner = propertyTypeObject;
      } else {
        throw new Error(
          "Please provide either a primitiveDataType or propertyTypeObjectProperties to generateSystemPropertyTypeSchema",
        );
      }

      // Optionally wrap inner in an array
      if (array) {
        const arrayOfPropertyValues: PropertyValueArray<
          OneOfSchema<PropertyValues>
        > = {
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

export const generateSystemDataTypeSchema = ({
  dataTypeId,
  ...rest
}: ConstructDataTypeParams & {
  dataTypeId: VersionedUrl;
}): DataType => {
  return {
    $id: dataTypeId,
    $schema: DATA_TYPE_META_SCHEMA,
    kind: "dataType",
    ...rest,
  };
};

export const createSystemDataTypeIfNotExists: ImpureGraphFunction<
  {
    dataTypeDefinition: ConstructDataTypeParams;
    conversions: Record<BaseUrl, Conversions>;
  } & BaseCreateTypeIfNotExistsParameters,
  Promise<DataTypeWithMetadata>
> = async (
  context,
  authentication,
  { dataTypeDefinition, conversions, migrationState, webShortname },
) => {
  const { title } = dataTypeDefinition;
  const baseUrl = generateSystemTypeBaseUrl({
    kind: "data-type",
    title,
    shortname: webShortname,
  });

  const versionNumber = makeOntologyTypeVersion({ major: 1 });

  const dataTypeId = versionedUrlFromComponents(baseUrl, versionNumber);

  migrationState.dataTypeVersions[baseUrl] = versionNumber;

  const existingDataType = await getDataTypeById(
    context.graphApi,
    authentication,
    {
      dataTypeId,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  ).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingDataType) {
    return existingDataType;
  }

  const dataTypeSchema = generateSystemDataTypeSchema({
    ...dataTypeDefinition,
    dataTypeId,
  });

  const { webId, systemActorMachineId } = await getOrCreateOwningWebId(
    context,
    webShortname,
  );

  if (isSelfHostedInstance) {
    /**
     * If this is a self-hosted instance, the system types will be created as external types that don't belong to an in-instance web,
     * although they will be created by a machine actor associated with an equivalently named web.
     */
    const { data: dataTypeMetadata } =
      await context.graphApi.loadExternalDataType(systemActorMachineId, {
        // Specify the schema so that self-hosted instances don't need network access to hash.ai
        schema: dataTypeSchema,
        conversions,
        provenance: context.provenance,
      });

    return {
      schema: dataTypeSchema,
      metadata: dataTypeMetadata as DataTypeMetadata,
    };
  } else {
    // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we need a web for system types to belong to
    const createdDataType = await createDataType(
      context,
      { actorId: systemActorMachineId },
      {
        webId,
        schema: dataTypeSchema,
        webShortname,
        conversions,
      },
    ).catch((createError) => {
      // logger.warn(`Failed to create data type: ${propertyTypeId}`);
      throw createError;
    });

    return createdDataType;
  }
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

  const versionNumber = makeOntologyTypeVersion({ major: 1 });

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

  const { webId, systemActorMachineId } = await getOrCreateOwningWebId(
    context,
    webShortname,
  );

  if (isSelfHostedInstance) {
    /**
     * If this is a self-hosted instance, the system types will be created as external types that don't belong to an
     * in-instance web, although they will be created by a machine actor associated with an equivalently named web.
     */
    await context.graphApi.loadExternalPropertyType(systemActorMachineId, {
      // Specify the schema so that self-hosted instances don't need network access to hash.ai
      schema: propertyTypeSchema,
      provenance: context.provenance,
    });

    return await getPropertyTypeById(context, authentication, {
      propertyTypeId: propertyTypeSchema.$id,
    });
  } else {
    // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we need a web for system types to belong to
    const createdPropertyType = await createPropertyType(
      context,
      { actorId: systemActorMachineId },
      {
        webId,
        schema: propertyTypeSchema,
        webShortname,
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
  titlePlural?: string;
  inverse?: EntityType["inverse"];
  description: string;
  labelProperty?: BaseUrl;
  icon?: string;
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
  }[];
};

/**
 * Helper method for generating an entity type schema for the Graph API.
 */
export const generateSystemEntityTypeSchema = (
  params: EntityTypeDefinition,
): EntityType => {
  /** @todo - clean this up to be more readable */
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
        { linkEntityType, destinationEntityTypes, minItems, maxItems },
      ): EntityType["links"] => ({
        ...prev,
        [typeof linkEntityType === "object"
          ? linkEntityType.schema.$id
          : linkEntityType]: {
          type: "array",
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

  const allOf = params.allOf
    ? atLeastOne(params.allOf.map((url) => ({ $ref: url })))
    : undefined;

  return {
    $schema: ENTITY_TYPE_META_SCHEMA,
    kind: "entityType",
    $id: params.entityTypeId,
    allOf,
    title: params.title,
    description: params.description,
    type: "object",
    properties,
    required: requiredProperties ? atLeastOne(requiredProperties) : undefined,
    links,
    labelProperty: params.labelProperty,
    icon: params.icon,
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

  const versionNumber = makeOntologyTypeVersion({ major: 1 });

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

  const { webId, systemActorMachineId } = await getOrCreateOwningWebId(
    context,
    webShortname,
  );

  // The type was missing, try and create it
  if (isSelfHostedInstance) {
    /**
     * If this is a self-hosted instance, the system types will be created as external types that don't belong to an in-instance web,
     * although they will be created by a machine actor associated with an equivalently named web.
     */
    await context.graphApi.loadExternalEntityType(systemActorMachineId, {
      // Specify the schema so that self-hosted instances don't need network access to hash.ai
      schema: entityTypeSchema,
      provenance: context.provenance,
    });

    return await getEntityTypeById(context, authentication, {
      entityTypeId: entityTypeSchema.$id,
    });
  } else {
    // If this is NOT a self-hosted instance, i.e. it's the 'main' HASH, we create the system types in a web
    const createdEntityType = await createEntityType(
      context,
      { actorId: systemActorMachineId },
      {
        webId,
        schema: entityTypeSchema,
        webShortname,
      },
    ).catch((createError) => {
      // logger.warn(`Failed to create entity type: ${entityTypeSchema.$id}`);
      throw createError;
    });

    return createdEntityType;
  }
};

export const getCurrentHashSystemEntityTypeId = ({
  entityTypeKey,
  migrationState,
}: {
  entityTypeKey: keyof typeof systemEntityTypes;
  migrationState: MigrationState;
}) => {
  const entityTypeBaseUrl = systemEntityTypes[entityTypeKey].entityTypeBaseUrl;

  const entityTypeVersion =
    migrationState.entityTypeVersions[entityTypeBaseUrl];

  if (typeof entityTypeVersion === "undefined") {
    throw new Error(
      `Expected '${entityTypeKey}' entity type to have been seeded`,
    );
  }

  return versionedUrlFromComponents(entityTypeBaseUrl, entityTypeVersion);
};

export const getCurrentHashLinkEntityTypeId = ({
  linkEntityTypeKey,
  migrationState,
}: {
  linkEntityTypeKey: keyof typeof systemLinkEntityTypes;
  migrationState: MigrationState;
}) => {
  const linkEntityTypeBaseUrl =
    systemLinkEntityTypes[linkEntityTypeKey].linkEntityTypeBaseUrl;

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

export const getCurrentHashPropertyTypeId = ({
  propertyTypeKey,
  migrationState,
}: {
  propertyTypeKey: keyof typeof systemPropertyTypes;
  migrationState: MigrationState;
}) => {
  const propertyTypeBaseUrl =
    systemPropertyTypes[propertyTypeKey].propertyTypeBaseUrl;

  const propertyTypeVersion =
    migrationState.propertyTypeVersions[propertyTypeBaseUrl];

  if (typeof propertyTypeVersion === "undefined") {
    throw new Error(
      `Expected '${propertyTypeKey}' property type to have been seeded`,
    );
  }

  return versionedUrlFromComponents(propertyTypeBaseUrl, propertyTypeVersion);
};

export const getCurrentHashDataTypeId = ({
  dataTypeKey,
  migrationState,
}: {
  dataTypeKey: keyof typeof systemDataTypes;
  migrationState: MigrationState;
}) => {
  const dataTypeBaseUrl = systemDataTypes[dataTypeKey].dataTypeBaseUrl;

  const dataTypeVersion = migrationState.dataTypeVersions[dataTypeBaseUrl];

  if (typeof dataTypeVersion === "undefined") {
    throw new Error(`Expected '${dataTypeKey}' data type to have been seeded`);
  }

  return versionedUrlFromComponents(dataTypeBaseUrl, dataTypeVersion);
};

type BaseUpdateTypeParameters = {
  migrationState: MigrationState;
};

export const updateSystemEntityType: ImpureGraphFunction<
  {
    currentEntityTypeId: VersionedUrl;
    newSchema: EntityType & { $id?: VersionedUrl };
  } & BaseUpdateTypeParameters,
  Promise<{ updatedEntityTypeId: VersionedUrl }>
> = async (
  context,
  authentication,
  { currentEntityTypeId, newSchema, migrationState },
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
      `Update requested for entity type with current entityTypeId ${currentEntityTypeId}, but the current version in migration state is ${versionInMigrationState.toString()}`,
    );
  }

  const nextEntityTypeVersion = incrementOntologyTypeVersion(version);
  const nextEntityTypeId = versionedUrlFromComponents(
    baseUrl,
    nextEntityTypeVersion,
  );
  try {
    await getEntityTypeById(context, authentication, {
      entityTypeId: nextEntityTypeId,
    });

    migrationState.entityTypeVersions[baseUrl] = nextEntityTypeVersion;

    return { updatedEntityTypeId: nextEntityTypeId };
  } catch {
    // the next version doesn't exist, continue to create it
  }

  const { $id: _, ...schemaWithout$id } = newSchema;

  const schemaWithConsistentSelfReferences = {
    ...schemaWithout$id,
    links: generateLinkMapWithConsistentSelfReferences(
      schemaWithout$id,
      currentEntityTypeId,
    ),
  };

  const updatedTypeMetadata = isSelfHostedInstance
    ? await context.graphApi
        .loadExternalEntityType(authentication.actorId, {
          schema: {
            ...schemaWithConsistentSelfReferences,
            $id: nextEntityTypeId,
          },
          provenance: context.provenance,
        })
        .then((resp) => resp.data)
    : await context.graphApi
        .updateEntityType(authentication.actorId, {
          typeToUpdate: currentEntityTypeId,
          schema: schemaWithConsistentSelfReferences,
          provenance: context.provenance,
        })
        .then((resp) => resp.data);

  const { version: newVersion } =
    updatedTypeMetadata.recordId as unknown as OntologyTypeRecordId;

  migrationState.entityTypeVersions[baseUrl] = newVersion;

  return {
    updatedEntityTypeId: versionedUrlFromComponents(baseUrl, newVersion),
  };
};

export const updateSystemPropertyType: ImpureGraphFunction<
  {
    currentPropertyTypeId: VersionedUrl;
    newSchema: UpdatePropertyType & { $id?: VersionedUrl };
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
      `Update requested for property type with current propertyTypeId ${currentPropertyTypeId}, but the current version in migration state is ${versionInMigrationState.toString()}`,
    );
  }

  const nextPropertyTypeId = versionedUrlFromComponents(
    baseUrl,
    incrementOntologyTypeVersion(version),
  );
  try {
    await getPropertyTypeById(context, authentication, {
      propertyTypeId: nextPropertyTypeId,
    });
    return { updatedPropertyTypeId: nextPropertyTypeId };
  } catch {
    // the next version doesn't exist, continue to create it
  }

  const { $id: _, ...schemaWithout$id } = newSchema;

  const updatedPropertyTypeMetadata = isSelfHostedInstance
    ? await context.graphApi
        .loadExternalPropertyType(authentication.actorId, {
          schema: {
            ...newSchema,
            $id: nextPropertyTypeId,
          },
          provenance: context.provenance,
        })
        .then((resp) => resp.data)
    : await context.graphApi
        .updatePropertyType(authentication.actorId, {
          typeToUpdate: currentPropertyTypeId,
          schema: schemaWithout$id,
          provenance: context.provenance,
        })
        .then((resp) => resp.data);

  const { version: newVersion } =
    updatedPropertyTypeMetadata.recordId as unknown as OntologyTypeRecordId;

  migrationState.propertyTypeVersions[baseUrl] = newVersion;

  return {
    updatedPropertyTypeId: versionedUrlFromComponents(baseUrl, newVersion),
  };
};

/**
 * Given a list of upgradedEntityTypeIds, and the keys of types which refer to them, update those types to refer to the new versions.
 *
 * @todo have some way of automatically checking all existing types for references to the upgraded types, avoid manually specifying them
 */
export const upgradeDependenciesInHashEntityType: ImpureGraphFunction<
  {
    dependentEntityTypeKeys: (keyof typeof systemEntityTypes)[];
    upgradedEntityTypeIds: VersionedUrl[];
  } & BaseUpdateTypeParameters,
  Promise<void>
> = async (
  context,
  authentication,
  { dependentEntityTypeKeys, migrationState, upgradedEntityTypeIds },
) => {
  /**
   * Because the dependents will be updated, we also need to make sure that any cross-references within them are updated
   */
  const nextDependentEntityTypeIds = dependentEntityTypeKeys.map((key) => {
    const currentDependentEntityTypeId = getCurrentHashSystemEntityTypeId({
      entityTypeKey: key,
      migrationState,
    });

    const { baseUrl, version } = componentsFromVersionedUrl(
      currentDependentEntityTypeId,
    );

    return versionedUrlFromComponents(
      baseUrl,
      incrementOntologyTypeVersion(version),
    );
  });

  for (const dependentEntityTypeKey of dependentEntityTypeKeys) {
    const currentDependentEntityTypeId = getCurrentHashSystemEntityTypeId({
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
      upgradedEntityTypeIds: [
        ...upgradedEntityTypeIds,
        ...nextDependentEntityTypeIds,
      ],
    });

    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentDependentEntityTypeId,
      migrationState,
      newSchema: newDependentSchema,
    });

    /**
     * @todo handle cascading updates – some of the updated system types may themselves be dependencies of other types
     *    not covered by the logic above
     * ideally we'd have a function to check all existing types for dependencies and update them
     * would also need to handle circular references as part of this
     */
  }
};

export const getEntitiesByType: ImpureGraphFunction<
  { entityTypeId: VersionedUrl },
  Promise<Entity[]>
> = async (context, authentication, { entityTypeId }) =>
  getEntities(context, authentication, {
    filter: {
      all: [
        generateVersionedUrlMatchingFilter(entityTypeId, {
          ignoreParents: true,
        }),
      ],
    },
    includeDrafts: false,
    temporalAxes: currentTimeInstantTemporalAxes,
  });

export const getExistingUsersAndOrgs: ImpureGraphFunction<
  Record<string, never>,
  Promise<{ users: Entity[]; orgs: Entity[] }>
> = async (context, authentication) => {
  const [users, orgs] = await Promise.all([
    getEntities(context, authentication, {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              { parameter: systemEntityTypes.user.entityTypeBaseUrl },
            ],
          },
        ],
      },
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
    }),
    getEntities(context, authentication, {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              { parameter: systemEntityTypes.organization.entityTypeBaseUrl },
            ],
          },
        ],
      },
      includeDrafts: false,
      temporalAxes: currentTimeInstantTemporalAxes,
    }),
  ]);

  return { users, orgs };
};

export const upgradeEntitiesToNewTypeVersion: ImpureGraphFunction<
  {
    entityTypeBaseUrls: BaseUrl[];
    migrationState: MigrationState;
    migrateProperties?: Record<
      BaseUrl,
      (
        previousProperties: PropertyObjectWithMetadata,
      ) => PropertyObjectWithMetadata
    >;
  },
  Promise<void>,
  false,
  true
> = async (
  context,
  authentication,
  { entityTypeBaseUrls, migrationState, migrateProperties },
) => {
  /**
   *  We have to do this web-by-web because we don't have a single actor that can see all entities in all webs
   *
   *  @todo figure out what to do about entities which the web machine bot can't view, if we ever create any such entities
   */
  const { users, orgs } = await getExistingUsersAndOrgs(
    context,
    authentication,
    {},
  );

  for (const webEntity of [...users, ...orgs]) {
    const webId = extractWebIdFromEntityId(
      webEntity.metadata.recordId.entityId,
    );

    await upgradeWebEntities({
      authentication,
      context,
      entityTypeBaseUrls,
      migrationState,
      migrateProperties,
      webId,
    });
  }
};
