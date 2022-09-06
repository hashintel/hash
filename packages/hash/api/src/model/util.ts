import {
  DataType,
  PropertyType,
  EntityType,
  LinkType,
  PropertyValues,
  VersionedUri,
  BaseUri,
} from "@blockprotocol/type-system-web";
import slugify from "slugify";
import { EntityTypeModel, PropertyTypeModel } from ".";
import { GraphApi } from "../graph";
import { FRONTEND_URL } from "../lib/config";

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

/** @todo avoid this look up, we can just do "entity-type" | ... etc. */
type SchemaKind =
  | EntityType["kind"]
  | PropertyType["kind"]
  | DataType["kind"]
  | LinkType["kind"];

const schemaKindSlugs: Record<SchemaKind, string> = {
  entityType: "entity-type",
  dataType: "data-type",
  propertyType: "property-type",
  linkType: "link-type",
};

const slugifySchemaTitle = (title: string): string =>
  slugify(title, { lower: true });

export const generateSchemaBaseUri = ({
  domain = FRONTEND_URL,
  namespace,
  kind,
  title,
}: {
  domain?: string;
  namespace: string;
  kind: SchemaKind;
  title: string;
}): BaseUri =>
  `${domain}/${namespace}/types/${schemaKindSlugs[kind]}/${slugifySchemaTitle(
    title,
  )}` as const;

export const generateSchemaUri = ({
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
  `${generateSchemaBaseUri({ domain, namespace, kind, title })}/v/1` as const;

/**
 * @todo use `extractBaseUri from the type system package when they're unified,
 *  and we're able to use functional code in node and web environments:
 *  https://app.asana.com/0/1200211978612931/1202923896339225/f
 */
export const extractBaseUri = (versionedUri: string) => {
  const baseUri = versionedUri.split("v/")[0];
  if (baseUri == null) {
    throw new Error(
      `couldn't extract base URI, malformed Versioned URI: ${versionedUri}`,
    );
  }

  return baseUri;
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

export const primitiveDataTypeVersionedUris = primitiveDataTypeTitles.reduce(
  (prev, title) => ({
    ...prev,
    [title]: generateSchemaUri({
      domain: "https://blockprotocol.org/",
      namespace: "@blockprotocol",
      kind: "dataType",
      title,
    }),
  }),
  {},
) as Record<PrimitiveDataTypeTitle, string>;

export type PropertyTypeCreatorParams = {
  namespace: string;
  title: string;
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
  const $id = generateSchemaUri({
    namespace: params.namespace,
    title: params.title,
    kind: "propertyType",
  });

  const possibleValues = params.possibleValues.map(
    ({ array, primitiveDataType, propertyTypeObjectProperties }) => {
      let inner: PropertyValues;

      if (primitiveDataType) {
        const dataTypeReference: PropertyValues.DataTypeReference = {
          $ref: primitiveDataTypeVersionedUris[primitiveDataType],
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
    pluralTitle: params.title,
    oneOf: possibleValues,
  };
};

export type EntityCreatorParams = {
  namespace: string;
  title: string;
  properties: {
    baseUri: string;
    versionedUri: string;
    required?: boolean;
    array?: { minItems?: number; maxItems?: number } | boolean;
  }[];
};
/**
 * Helper method for generating an entity schema for the Graph API.
 *
 * @todo make use of new type system package instead of ad-hoc types.
 *   https://app.asana.com/0/1202805690238892/1202892835843657/f
 */
export const generateWorkspaceEntityTypeSchema = (
  params: EntityCreatorParams,
): EntityType => {
  const $id = generateSchemaUri({
    namespace: params.namespace,
    title: params.title,
    kind: "entityType",
  });

  /** @todo - clean this up to be more readable */
  const properties = params.properties.reduce(
    (prev, { versionedUri, array }) => {
      /**
       *  @todo - use the Type System package to extract the base URI, this is currently blocked by unifying the packages
       *  so we can use the node/web version within API depending on env:
       *  https://app.asana.com/0/1200211978612931/1202923896339225/f
       */
      const baseUri = versionedUri.split("v/")[0]!;

      return {
        ...prev,
        [baseUri]: array
          ? {
              type: "array",
              items: { $ref: versionedUri },
              ...(array === true ? {} : array),
            }
          : { $ref: versionedUri },
      };
    },
    {},
  );

  const requiredProperties = params.properties
    .filter(({ required }) => !!required)
    .map(({ baseUri }) => baseUri);

  return {
    $id,
    title: params.title,
    pluralTitle: params.title,
    type: "object",
    kind: "entityType",
    properties,
    required: requiredProperties,
  };
};

export const entityTypeInitializer = (
  params: EntityCreatorParams,
): ((graphApi?: GraphApi) => Promise<EntityTypeModel>) => {
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
      entityTypeModel = await EntityTypeModel.create(graphApi, {
        accountId: workspaceAccountId,
        schema: entityType,
      });

      return entityTypeModel;
    }
  };
};

export const propertyTypeInitializer = (
  params: PropertyTypeCreatorParams,
): ((graphApi?: GraphApi) => Promise<PropertyTypeModel>) => {
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
      propertyTypeModel = await PropertyTypeModel.create(graphApi, {
        accountId: workspaceAccountId,
        schema: propertyType,
      });

      return propertyTypeModel;
    }
  };
};
