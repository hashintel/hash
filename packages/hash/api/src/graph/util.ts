import {
  PropertyType,
  EntityType,
  PropertyValues,
  DataTypeReference,
  Object,
  ValueOrArray,
  PropertyTypeReference,
  OneOf,
  Array,
  VersionedUri,
} from "@blockprotocol/type-system";
import {
  PrimitiveDataTypeKey,
  types,
} from "@hashintel/hash-shared/ontology-types";
import {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  linkEntityTypeUri,
} from "@hashintel/hash-subgraph";
import { OwnedById } from "@hashintel/hash-shared/types";

import { GraphApi } from ".";
import { systemUserAccountId } from "./system-user";
import {
  createPropertyType,
  getPropertyTypeById,
} from "./ontology/primitive/property-type";
import { logger } from "../logger";
import {
  createEntityType,
  getEntityTypeById,
} from "./ontology/primitive/entity-type";
import { NotFoundError } from "../lib/error";

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
  propertyTypeId: VersionedUri;
  title: string;
  description?: string;
  possibleValues: {
    primitiveDataType?: PrimitiveDataTypeKey;
    propertyTypeObjectProperties?: { [_ in string]: { $ref: VersionedUri } };
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
          $ref: types.dataType[primitiveDataType].dataTypeId,
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
    $id: params.propertyTypeId,
    kind: "propertyType",
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
): ((graphApi: GraphApi) => Promise<PropertyTypeWithMetadata>) => {
  let propertyType: PropertyTypeWithMetadata;

  return async (graphApi?: GraphApi) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    if (propertyType) {
      return propertyType;
    } else if (!graphApi) {
      throw new Error(
        `property type ${params.title} was uninitialized, and function was called without passing a graphApi object`,
      );
    } else {
      const propertyTypeSchema = generateSystemPropertyTypeSchema(params);

      // initialize
      propertyType = await getPropertyTypeById(
        { graphApi },
        {
          propertyTypeId: propertyTypeSchema.$id,
        },
      ).catch(async (error: Error) => {
        if (error instanceof NotFoundError) {
          // The type was missing, try and create it
          return await createPropertyType(
            { graphApi },
            {
              ownedById: systemUserAccountId as OwnedById,
              schema: propertyTypeSchema,
              actorId: systemUserAccountId,
            },
          ).catch((createError) => {
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

export type EntityTypeCreatorParams = {
  entityTypeId: VersionedUri;
  title: string;
  description?: string;
  properties?: {
    propertyType: PropertyTypeWithMetadata;
    required?: boolean;
    array?: { minItems?: number; maxItems?: number } | boolean;
  }[];
  outgoingLinks?: {
    linkEntityType: EntityTypeWithMetadata;
    destinationEntityTypes: (
      | EntityTypeWithMetadata
      // Some models may reference themselves. This marker is used to stop infinite loops during initialization by telling the initializer to use a self reference
      | "SELF_REFERENCE"
    )[];
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
        [propertyType.metadata.editionId.baseId]: array
          ? {
              type: "array",
              items: { $ref: propertyType.schema.$id },
              ...(array === true ? {} : array),
            }
          : { $ref: propertyType.schema.$id },
      }),
      {},
    ) ?? {};

  const requiredProperties = params.properties
    ?.filter(({ required }) => !!required)
    .map(({ propertyType }) => propertyType.metadata.editionId.baseId);

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
        [linkEntityType.schema.$id]: {
          type: "array",
          ordered,
          items: {
            oneOf: destinationEntityTypes.map((entityTypeOrReference) => ({
              $ref:
                entityTypeOrReference === "SELF_REFERENCE"
                  ? params.entityTypeId
                  : entityTypeOrReference.schema.$id,
            })),
          },
          minItems,
          maxItems,
        },
      }),
      {},
    ) ?? undefined;

  return {
    $id: params.entityTypeId,
    title: params.title,
    description: params.description,
    type: "object",
    kind: "entityType",
    properties,
    required: requiredProperties,
    links,
  };
};

export type LinkEntityTypeCreatorParams = Omit<
  EntityTypeCreatorParams,
  "entityTypeId"
> & {
  linkEntityTypeId: VersionedUri;
};

/**
 * Helper method for generating a link entity type schema for the Graph API.
 */
export const generateSystemLinkEntityTypeSchema = (
  params: LinkEntityTypeCreatorParams,
): EntityType => ({
  ...generateSystemEntityTypeSchema({
    ...params,
    entityTypeId: params.linkEntityTypeId,
  }),
  allOf: [{ $ref: linkEntityTypeUri }],
});

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
): ((graphApi: GraphApi) => Promise<EntityTypeWithMetadata>) => {
  let entityType: EntityTypeWithMetadata | undefined;

  return async (graphApi?: GraphApi) => {
    if (entityType) {
      return entityType;
    } else if (!graphApi) {
      throw new Error(
        `entity type ${params.title} was uninitialized, and function was called without passing a graphApi object`,
      );
    } else {
      const entityTypeSchema =
        "linkEntityTypeId" in params
          ? generateSystemLinkEntityTypeSchema(params)
          : generateSystemEntityTypeSchema(params);

      // initialize
      entityType = await getEntityTypeById(
        { graphApi },
        {
          entityTypeId: entityTypeSchema.$id,
        },
      ).catch(async (error: Error) => {
        if (error instanceof NotFoundError) {
          // The type was missing, try and create it
          return await createEntityType(
            { graphApi },
            {
              ownedById: systemUserAccountId as OwnedById,
              schema: entityTypeSchema,
              actorId: systemUserAccountId,
            },
          ).catch((createError) => {
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
