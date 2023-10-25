import {
  Array,
  DataTypeReference,
  ENTITY_TYPE_META_SCHEMA,
  EntityType,
  extractBaseUrl,
  Object,
  OneOf,
  PROPERTY_TYPE_META_SCHEMA,
  PropertyType,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  PrimitiveDataTypeKey,
  systemTypes,
} from "@local/hash-isomorphic-utils/ontology-types";
import {
  EntityTypeWithMetadata,
  linkEntityTypeUrl,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

import { NotFoundError } from "../lib/error";
import { logger } from "../logger";
import { ImpureGraphContext } from "./index";
import {
  createEntityType,
  getEntityTypeById,
} from "./ontology/primitive/entity-type";
import {
  createPropertyType,
  getPropertyTypeById,
} from "./ontology/primitive/property-type";
import { systemUserAccountId } from "./system-user";

/** @todo: enable admins to expand upon restricted shortnames block list */
export const RESTRICTED_SHORTNAMES = [
  "-",
  ".well-known",
  "404.html",
  "422.html",
  "500.html",
  "502.html",
  "503.html",
  "abuse_reports",
  "admin",
  "ag",
  "api",
  "apple-touch-icon-precomposed.png",
  "apple-touch-icon.png",
  "assets",
  "autocomplete",
  "bh",
  "bhg",
  "dashboard",
  "deploy.html",
  "dw",
  "example",
  "explore",
  "favicon.ico",
  "favicon.png",
  "files",
  "groups",
  "health_check",
  "help",
  "import",
  "invites",
  "jwt",
  "local",
  "login",
  "new",
  "oauth",
  "org",
  "profile",
  "projects",
  "public",
  "robots.txt",
  "s",
  "search",
  "sent_notifications",
  "slash-command-logo.png",
  "snippets",
  "unsubscribes",
  "uploads",
  "user",
  "users",
  "v2",
];

export type PropertyTypeCreatorParams = {
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
  params: PropertyTypeCreatorParams,
): PropertyType => {
  const possibleValues: PropertyValues[] = params.possibleValues.map(
    ({ array, primitiveDataType, propertyTypeObjectProperties }) => {
      let inner: PropertyValues;

      if (primitiveDataType) {
        const dataTypeReference: DataTypeReference = {
          $ref: systemTypes.dataType[primitiveDataType].dataTypeId,
        };
        inner = dataTypeReference;
      } else if (propertyTypeObjectProperties) {
        const propertyTypeObject: Object<ValueOrArray<PropertyTypeReference>> =
          {
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

/**
 * Returns a function which can be used to initialize a given property type. This asynchronous design allows us to express
 * dependencies between types in a lazy fashion, where the dependencies can be initialized as they're encountered. (This is
 * likely to cause problems if we introduce circular dependencies)
 *
 * @param params the data required to create a new property type
 * @returns an async function which can be called to initialize the property type, returning its property type
 */
export const propertyTypeInitializer = (
  params: PropertyTypeCreatorParams,
): ((context: ImpureGraphContext) => Promise<PropertyTypeWithMetadata>) => {
  let propertyType: PropertyTypeWithMetadata;

  return async (context?: ImpureGraphContext) => {
    const authentication = { actorId: systemUserAccountId };

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    if (propertyType) {
      return propertyType;
    } else if (!context) {
      throw new Error(
        `property type ${params.title} was uninitialized, and function was called without passing a context object`,
      );
    } else {
      const propertyTypeSchema = generateSystemPropertyTypeSchema(params);

      // initialize
      propertyType = await getPropertyTypeById(context, authentication, {
        propertyTypeId: propertyTypeSchema.$id,
      }).catch(async (error: Error) => {
        if (error instanceof NotFoundError) {
          // The type was missing, try and create it
          return await createPropertyType(context, authentication, {
            ownedById: systemUserAccountId as OwnedById,
            schema: propertyTypeSchema,
          }).catch((createError) => {
            logger.warn(`Failed to create property type: ${params.title}`);
            throw createError;
          });
        } else {
          logger.warn(
            `Failed to check existence of property type: ${params.title}`,
          );
          throw error;
        }
      });

      return propertyType;
    }
  };
};

type linkDestinationConstraint =
  | EntityTypeWithMetadata
  | VersionedUrl
  // Some models may reference themselves. This marker is used to stop infinite loops during initialization by telling the initializer to use a self reference
  | "SELF_REFERENCE";

export type EntityTypeCreatorParams = {
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
      linkDestinationConstraint,
      ...linkDestinationConstraint[],
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
  params: EntityTypeCreatorParams,
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

export type LinkEntityTypeCreatorParams = Omit<
  EntityTypeCreatorParams,
  "entityTypeId"
> & {
  linkEntityTypeId: VersionedUrl;
};

/**
 * Helper method for generating a link entity type schema for the Graph API.
 */
export const generateSystemLinkEntityTypeSchema = (
  params: LinkEntityTypeCreatorParams,
): EntityType => {
  const baseSchema = generateSystemEntityTypeSchema({
    ...params,
    entityTypeId: params.linkEntityTypeId,
  });

  return {
    ...baseSchema,
    allOf: [
      ...(baseSchema.allOf ?? []),
      {
        $ref: linkEntityTypeUrl,
      },
    ],
  };
};

/**
 * Returns a function which can be used to initialize a given entity type. This asynchronous design allows us to express
 * dependencies between types in a lazy fashion, where the dependencies can be initialized as they're encountered. (This is
 * likely to cause problems if we introduce circular dependencies)
 *
 * @param params the data required to create a new entity type
 * @returns an async function which can be called to initialize the entity type, returning its entity type
 */
export const entityTypeInitializer = (
  params: EntityTypeCreatorParams | LinkEntityTypeCreatorParams,
): ((context: ImpureGraphContext) => Promise<EntityTypeWithMetadata>) => {
  let entityType: EntityTypeWithMetadata | undefined;

  return async (context?: ImpureGraphContext) => {
    const authentication = { actorId: systemUserAccountId };

    if (entityType) {
      return entityType;
    } else if (!context) {
      throw new Error(
        `entity type ${params.title} was uninitialized, and function was called without passing a context object`,
      );
    } else {
      const entityTypeSchema =
        "linkEntityTypeId" in params
          ? generateSystemLinkEntityTypeSchema(params)
          : generateSystemEntityTypeSchema(params);

      // initialize
      entityType = await getEntityTypeById(context, authentication, {
        entityTypeId: entityTypeSchema.$id,
      }).catch(async (error: Error) => {
        if (error instanceof NotFoundError) {
          // The type was missing, try and create it
          return await createEntityType(context, authentication, {
            ownedById: systemUserAccountId as OwnedById,
            schema: entityTypeSchema,
          }).catch((createError) => {
            logger.warn(`Failed to create entity type: ${params.title}`);
            throw createError;
          });
        } else {
          logger.warn(
            `Failed to check existence of entity type: ${params.title}`,
          );
          throw error;
        }
      });

      return entityType;
    }
  };
};
