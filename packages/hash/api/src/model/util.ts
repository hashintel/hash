import {
  PropertyType,
  EntityType,
  PropertyValues,
  VersionedUri,
  LinkType,
} from "@blockprotocol/type-system-web";
import { AxiosError } from "axios";
import slugify from "slugify";
import { EntityTypeModel, LinkTypeModel, PropertyTypeModel } from ".";
import { GraphApi } from "../graph";
import { FRONTEND_URL } from "../lib/config";
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
 * @todo: create workspace types in an account that's dedicated to
 * the HASH workspace. For now we're just chucking them in the root account.
 */
export const workspaceAccountId = nilUuid;

type SchemaKind = "data-type" | "property-type" | "entity-type" | "link-type";

const slugifySchemaTitle = (title: string): string =>
  slugify(title, { lower: true });

export const generateTypeId = ({
  domain = FRONTEND_URL,
  namespace,
  kind,
  title,
}: {
  domain?: string;
  namespace: string;
  kind: SchemaKind;
  title: string;
}): VersionedUri =>
  `${domain}/@${namespace}/types/${kind}/${slugifySchemaTitle(
    title,
  )}/v/1` as const;

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

const primitiveDataTypeTitles = [
  "Text",
  "Number",
  "Boolean",
  "Empty List",
  "Object",
  "Null",
] as const;

export type PrimitiveDataTypeTitle = typeof primitiveDataTypeTitles[number];

export const primitiveDataTypeIds = primitiveDataTypeTitles.reduce(
  (prev, title) => ({
    ...prev,
    [title]: generateTypeId({
      domain: "https://blockprotocol.org",
      namespace: "blockprotocol",
      kind: "data-type",
      title,
    }),
  }),
  {},
) as Record<PrimitiveDataTypeTitle, string>;

export type PropertyTypeCreatorParams = {
  namespace: string;
  title: string;
  description?: string;
  possibleValues: {
    primitiveDataType?: PrimitiveDataTypeTitle;
    propertyTypeObjectProperties?: { [_ in string]: { $ref: string } };
    array?: boolean;
  }[];
};

/**
 * Helper method for generating a property type schema for the Graph API.
 */
export const generateWorkspacePropertyTypeSchema = (
  params: PropertyTypeCreatorParams,
): PropertyType => {
  const $id = generateTypeId({
    namespace: params.namespace,
    title: params.title,
    kind: "property-type",
  });

  const possibleValues = params.possibleValues.map(
    ({ array, primitiveDataType, propertyTypeObjectProperties }) => {
      let inner: PropertyValues;

      if (primitiveDataType) {
        const dataTypeReference: PropertyValues.DataTypeReference = {
          $ref: primitiveDataTypeIds[primitiveDataType],
        };
        inner = dataTypeReference;
      } else if (propertyTypeObjectProperties) {
        const propertyTypeObject: PropertyValues.PropertyTypeObject = {
          type: "object" as const,
          properties: propertyTypeObjectProperties,
        };
        inner = propertyTypeObject;
      } else {
        throw new Error(
          "Please provide either a primitiveDataType or propertyTypeObjectProperties to generateWorkspacePropertyTypeSchema",
        );
      }

      // Optionally wrap inner in an array
      if (array) {
        const arrayOfPropertyValues: PropertyValues.ArrayOfPropertyValues = {
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
    $id,
    kind: "propertyType",
    title: params.title,
    description: params.description,
    pluralTitle: params.title,
    oneOf: possibleValues,
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
      const propertyType = generateWorkspacePropertyTypeSchema(params);

      // initialize
      propertyTypeModel = await PropertyTypeModel.get(graphApi, {
        propertyTypeId: propertyType.$id,
      }).catch(async (error: AxiosError) => {
        if (error.response?.status === 404) {
          // The type was missing, try and create it
          return await PropertyTypeModel.create(graphApi, {
            ownedById: workspaceAccountId,
            schema: propertyType,
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
  namespace: string;
  title: string;
  pluralTitle?: string;
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
};

/**
 * Helper method for generating an entity type schema for the Graph API.
 *
 * @todo make use of new type system package instead of ad-hoc types.
 *   https://app.asana.com/0/1202805690238892/1202892835843657/f
 */
export const generateWorkspaceEntityTypeSchema = (
  params: EntityTypeCreatorParams,
): EntityType => {
  const $id = generateTypeId({
    namespace: params.namespace,
    title: params.title,
    kind: "entity-type",
  });

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
                      ? $id
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
    $id,
    title: params.title,
    pluralTitle: params.pluralTitle ?? params.title,
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
      const entityType = generateWorkspaceEntityTypeSchema(params);

      // initialize
      entityTypeModel = await EntityTypeModel.get(graphApi, {
        entityTypeId: entityType.$id,
      }).catch(async (error: AxiosError) => {
        if (error.response?.status === 404) {
          // The type was missing, try and create it
          return await EntityTypeModel.create(graphApi, {
            ownedById: workspaceAccountId,
            schema: entityType,
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
  namespace: string;
  title: string;
  description: string;
  relatedKeywords?: string[];
};

/**
 * Helper method for generating a link type schema for the Graph API.
 *
 * @todo make use of new type system package instead of ad-hoc types.
 *   https://app.asana.com/0/1202805690238892/1202892835843657/f
 */
export const generateWorkspaceLinkTypeSchema = (
  params: LinkTypeCreatorParams,
): LinkType => {
  const $id = generateTypeId({
    namespace: params.namespace,
    title: params.title,
    kind: "link-type",
  });

  return {
    kind: "linkType",
    $id,
    title: params.title,
    pluralTitle: params.title,
    description: params.description,
    relatedKeywords: params.relatedKeywords,
  };
};

/**
 * Returns a function which can be used to initialize a given link type. This asynchronous design allows us to express
 * dependencies between types in a lazy fashion, where the dependencies can be initialized as they're encountered. (This is
 * likely to cause problems if we introduce circular dependencies)
 *
 * @param params the data required to create a new link type
 * @returns an async function which can be called to initialize the entity type, returning its LinkTypeModel
 */
export const linkTypeInitializer = (
  params: LinkTypeCreatorParams,
): ((graphApi: GraphApi) => Promise<LinkTypeModel>) => {
  let linkTypeModel: LinkTypeModel;

  return async (graphApi?: GraphApi) => {
    if (linkTypeModel) {
      return linkTypeModel;
    } else if (graphApi == null) {
      throw new Error(
        `link type ${params.title} was uninitialized, and function was called without passing a graphApi object`,
      );
    } else {
      const linkType = generateWorkspaceLinkTypeSchema(params);

      // initialize
      linkTypeModel = await LinkTypeModel.get(graphApi, {
        linkTypeId: linkType.$id,
      }).catch(async (error: AxiosError) => {
        if (error.response?.status === 404) {
          // The type was missing, try and create it
          return await LinkTypeModel.create(graphApi, {
            ownedById: workspaceAccountId,
            schema: linkType,
          }).catch((createError: AxiosError) => {
            logger.warn(`Failed to create link type: ${params.title}`);
            throw createError;
          });
        } else {
          logger.warn(
            `Failed to check existence of link type: ${params.title}`,
          );
          throw error;
        }
      });

      return linkTypeModel;
    }
  };
};
