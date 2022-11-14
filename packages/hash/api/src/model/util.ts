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
} from "@blockprotocol/type-system-web";
import { PrimitiveDataTypeKey, types } from "@hashintel/hash-shared/types";
import { AxiosError } from "axios";
import { EntityTypeModel, LinkTypeModel, PropertyTypeModel } from ".";
import { GraphApi } from "../graph";
import { logger } from "../logger";

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

export const nilUuid = "00000000-0000-0000-0000-000000000000" as const;

/**
 * @todo: create system types in an account that's dedicated to
 * the HASH instance. For now we're just chucking them in the root account.
 */
export const systemAccountId = nilUuid;

/**
 * @todo use `extractBaseUri` from the type system package when they're unified,
 *  and we're able to use functional code in node and web environments:
 *  https://app.asana.com/0/1200211978612931/1202923896339225/f
 */
export const splitVersionedUri = (
  versionedUri: string,
): { baseUri: string; version: number } => {
  const split = versionedUri.split("v/");
  if (split == null) {
    throw new Error(
      `couldn't extract base URI, malformed Versioned URI: ${versionedUri}`,
    );
  }

  const version = Number(split.pop());
  if (Number.isNaN(version)) {
    throw new Error("version is not a valid number");
  }

  const baseUri = split.join("v/");

  return { baseUri, version };
};

/**
 * @todo use `extractBaseUri from the type system package when they're unified,
 *  and we're able to use functional code in node and web environments:
 *  https://app.asana.com/0/1200211978612931/1202923896339225/f
 */
export const extractBaseUri = (versionedUri: string): string => {
  return splitVersionedUri(versionedUri).baseUri;
};

export type PropertyTypeCreatorParams = {
  propertyTypeId: VersionedUri;
  title: string;
  description?: string;
  possibleValues: {
    primitiveDataType?: PrimitiveDataTypeKey;
    propertyTypeObjectProperties?: { [_ in string]: { $ref: VersionedUri } };
    array?: boolean;
  }[];
  actorId: string;
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
 * @returns an async function which can be called to initialize the property type, returning its PropertyTypeModel
 */
export const propertyTypeInitializer = (
  params: PropertyTypeCreatorParams,
): ((graphApi: GraphApi) => Promise<PropertyTypeModel>) => {
  let propertyTypeModel: PropertyTypeModel;

  return async (graphApi?: GraphApi) => {
    if (propertyTypeModel) {
      return propertyTypeModel;
    } else if (graphApi == null) {
      throw new Error(
        `property type ${params.title} was uninitialized, and function was called without passing a graphApi object`,
      );
    } else {
      const propertyType = generateSystemPropertyTypeSchema(params);

      // initialize
      propertyTypeModel = await PropertyTypeModel.get(graphApi, {
        propertyTypeId: propertyType.$id,
      }).catch(async (error: AxiosError) => {
        if (error.response?.status === 404) {
          // The type was missing, try and create it
          return await PropertyTypeModel.create(graphApi, {
            ownedById: systemAccountId,
            schema: propertyType,
            actorId: params.actorId,
          }).catch((createError: AxiosError) => {
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

      return propertyTypeModel;
    }
  };
};

export type EntityTypeCreatorParams = {
  entityTypeId: VersionedUri;
  title: string;
  properties: {
    propertyTypeModel: PropertyTypeModel;
    required?: boolean;
    array?: { minItems?: number; maxItems?: number } | boolean;
  }[];
  outgoingLinks: {
    linkTypeModel: LinkTypeModel;
    destinationEntityTypeModels: (
      | EntityTypeModel
      // Some models may reference themselves. This marker is used to stop infinite loops during initialization by telling the initializer to use a self reference
      | "SELF_REFERENCE"
    )[];
    required?: boolean;
    array?: { minItems?: number; maxItems?: number } | boolean;
    ordered?: boolean;
  }[];
  actorId: string;
};

/**
 * Helper method for generating an entity type schema for the Graph API.
 *
 * @todo make use of new type system package instead of ad-hoc types.
 *   https://app.asana.com/0/1202805690238892/1202892835843657/f
 */
export const generateSystemEntityTypeSchema = (
  params: EntityTypeCreatorParams,
): EntityType => {
  /** @todo - clean this up to be more readable: https://app.asana.com/0/1202805690238892/1202931031833226/f */
  const properties = params.properties.reduce(
    (prev, { propertyTypeModel, array }) => ({
      ...prev,
      [propertyTypeModel.baseUri]: array
        ? {
            type: "array",
            items: { $ref: propertyTypeModel.schema.$id },
            ...(array === true ? {} : array),
          }
        : { $ref: propertyTypeModel.schema.$id },
    }),
    {},
  );

  const requiredProperties = params.properties
    .filter(({ required }) => !!required)
    .map(({ propertyTypeModel }) => propertyTypeModel.baseUri);

  const links =
    params.outgoingLinks.length > 0
      ? params.outgoingLinks.reduce<EntityType["links"]>(
          (
            prev,
            {
              linkTypeModel,
              destinationEntityTypeModels,
              array,
              ordered = false,
            },
          ) => {
            const oneOf = {
              oneOf: destinationEntityTypeModels.map(
                (entityTypeModelOrReference) => ({
                  $ref:
                    entityTypeModelOrReference === "SELF_REFERENCE"
                      ? params.entityTypeId
                      : entityTypeModelOrReference.schema.$id,
                }),
              ),
            };

            return {
              ...prev,
              [linkTypeModel.schema.$id]: array
                ? {
                    type: "array",
                    items: oneOf,
                    ordered,
                    ...(array === true ? {} : array),
                  }
                : oneOf,
            };
          },
          {},
        )
      : undefined;

  const requiredLinks = params.outgoingLinks
    .filter(({ required }) => !!required)
    .map(({ linkTypeModel }) => linkTypeModel.schema.$id);

  return {
    $id: params.entityTypeId,
    title: params.title,
    type: "object",
    kind: "entityType",
    properties,
    required: requiredProperties.length > 0 ? requiredProperties : undefined,
    links,
    requiredLinks: requiredLinks.length > 0 ? requiredLinks : undefined,
  };
};

/**
 * Returns a function which can be used to initialize a given entity type. This asynchronous design allows us to express
 * dependencies between types in a lazy fashion, where the dependencies can be initialized as they're encountered. (This is
 * likely to cause problems if we introduce circular dependencies)
 *
 * @param params the data required to create a new entity type
 * @returns an async function which can be called to initialize the entity type, returning its EntityTypeModel
 */
export const entityTypeInitializer = (
  params: EntityTypeCreatorParams,
): ((graphApi: GraphApi) => Promise<EntityTypeModel>) => {
  let entityTypeModel: EntityTypeModel;

  return async (graphApi?: GraphApi) => {
    if (entityTypeModel) {
      return entityTypeModel;
    } else if (graphApi == null) {
      throw new Error(
        `entity type ${params.title} was uninitialized, and function was called without passing a graphApi object`,
      );
    } else {
      const entityType = generateSystemEntityTypeSchema(params);

      // initialize
      entityTypeModel = await EntityTypeModel.get(graphApi, {
        entityTypeId: entityType.$id,
      }).catch(async (error: AxiosError) => {
        if (error.response?.status === 404) {
          // The type was missing, try and create it
          return await EntityTypeModel.create(graphApi, {
            ownedById: systemAccountId,
            schema: entityType,
            actorId: params.actorId,
          }).catch((createError: AxiosError) => {
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

      return entityTypeModel;
    }
  };
};

export type LinkTypeCreatorParams = {
  linkTypeId: string;
  title: string;
  description: string;
  relatedKeywords?: string[];
  actorId: string;
};

// /**
//  * Helper method for generating a link type schema for the Graph API.
//  *
//  * @todo make use of new type system package instead of ad-hoc types.
//  *   https://app.asana.com/0/1202805690238892/1202892835843657/f
//  */
// export const generateSystemLinkTypeSchema = (
//   params: LinkTypeCreatorParams,
// ): LinkType => {
//   return {
//     kind: "linkType",
//     $id: params.linkTypeId,
//     title: params.title,
//     pluralTitle: params.title,
//     description: params.description,
//     relatedKeywords: params.relatedKeywords,
//   };
// };

// /**
//  * Returns a function which can be used to initialize a given link type. This asynchronous design allows us to express
//  * dependencies between types in a lazy fashion, where the dependencies can be initialized as they're encountered. (This is
//  * likely to cause problems if we introduce circular dependencies)
//  *
//  * @param params the data required to create a new link type
//  * @returns an async function which can be called to initialize the entity type, returning its LinkTypeModel
//  */
// export const linkTypeInitializer = (
//   params: LinkTypeCreatorParams,
// ): ((graphApi: GraphApi) => Promise<LinkTypeModel>) => {
//   let linkTypeModel: LinkTypeModel;

//   return async (graphApi?: GraphApi) => {
//     if (linkTypeModel) {
//       return linkTypeModel;
//     } else if (graphApi == null) {
//       throw new Error(
//         `link type ${params.title} was uninitialized, and function was called without passing a graphApi object`,
//       );
//     } else {
//       const linkType = generateSystemLinkTypeSchema(params);

//       // initialize
//       linkTypeModel = await LinkTypeModel.get(graphApi, {
//         linkTypeId: linkType.$id,
//       }).catch(async (error: AxiosError) => {
//         if (error.response?.status === 404) {
//           // The type was missing, try and create it
//           return await LinkTypeModel.create(graphApi, {
//             ownedById: systemAccountId,
//             schema: linkType,
//             actorId: params.actorId,
//           }).catch((createError: AxiosError) => {
//             logger.warn(`Failed to create link type: ${params.title}`);
//             throw createError;
//           });
//         } else {
//           logger.warn(
//             `Failed to check existence of link type: ${params.title}`,
//           );
//           throw error;
//         }
//       });

//       return linkTypeModel;
//     }
//   };
// };
