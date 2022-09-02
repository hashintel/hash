import {
  DataType,
  PropertyType,
  EntityType,
  LinkType,
} from "@blockprotocol/type-system-web";
import slugify from "slugify";
import { getRequiredEnv } from "../util";

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

const workspaceAccountShortname = getRequiredEnv("WORKSPACE_ACCOUNT_SHORTNAME");

/**
 * @todo: revisit how this URI is defined and obtained as this is a temporary solution
 *   https://app.asana.com/0/1200211978612931/1202848989198299/f
 */
export const workspaceTypesNamespaceUri = `https://example.com/@${workspaceAccountShortname}/types`;

export const blockprotocolTypesNamespaceUri =
  "https://blockprotocol.org/@blockprotocol/types";

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

/**
 * @todo replace with unified type ID generation
 *   https://app.asana.com/0/1200211978612931/1202848989198299/f
 */
const slugifySchemaTitle = (title: string): string =>
  slugify(title, { lower: true });

export const generateSchemaBaseUri = (params: {
  namespaceUri: string;
  kind: SchemaKind;
  title: string;
}) =>
  `${params.namespaceUri}/${schemaKindSlugs[params.kind]}/${slugifySchemaTitle(
    params.title,
  )}/` as const;

export const generateSchemaVersionedUri = (params: {
  namespaceUri: string;
  kind: SchemaKind;
  title: string;
  version?: number;
}) => `${generateSchemaBaseUri(params)}v/${params.version ?? 1}` as const;

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
    [title]: generateSchemaVersionedUri({
      namespaceUri: blockprotocolTypesNamespaceUri,
      kind: "dataType",
      title,
      /** @todo: get latest version of primitive data tyeps incase they are udpated */
      version: 1,
    }),
  }),
  {},
) as Record<PrimitiveDataTypeTitle, string>;

/**
 * Helper method for generating a property type schema for the Graph API.
 *
 * @todo make use of new type system package instead of ad-hoc types.
 *   https://app.asana.com/0/1202805690238892/1202892835843657/f
 */
export const generateWorkspacePropertyTypeSchema = (params: {
  title: string;

  possibleValues: {
    primitiveDataType?: PrimitiveDataTypeTitle;
    propertyTypeObject?: { [_ in string]: { $ref: string } };
    array?: boolean;
  }[];
}): PropertyType => ({
  $id: generateSchemaVersionedUri({
    namespaceUri: workspaceTypesNamespaceUri,
    title: params.title,
    kind: "propertyType",
  }),
  kind: "propertyType",
  title: params.title,
  pluralTitle: params.title,
  oneOf: params.possibleValues.map(
    ({ array, primitiveDataType, propertyTypeObject }) => {
      let inner;
      if (primitiveDataType) {
        inner = {
          $ref: primitiveDataTypeVersionedUris[primitiveDataType],
        };
      } else if (propertyTypeObject) {
        inner = { type: "object" as const, properties: propertyTypeObject };
      } else {
        throw new Error(
          "Please provide either a primitiveDataType or a propertyTypeObject to generateWorkspacePropertyTypeSchema",
        );
      }
      if (array) {
        return {
          type: "array",
          items: {
            oneOf: [inner],
          },
        };
      } else {
        return inner;
      }
    },
    /**
     * @todo remove this cast when the method uses the new type system package.
     *   https://app.asana.com/0/1202805690238892/1202892835843657/f
     */
  ) as any,
});

/**
 * Helper method for generating an entity schema for the Graph API.
 *
 * @todo make use of new type system package instead of ad-hoc types.
 *   https://app.asana.com/0/1202805690238892/1202892835843657/f
 */
export const generateWorkspaceEntityTypeSchema = (params: {
  title: string;
  properties: {
    baseUri: string;
    versionedUri: string;
    required?: boolean;
    array?: { minItems?: number; maxItems?: number } | boolean;
  }[];
}): EntityType => ({
  $id: generateSchemaVersionedUri({
    namespaceUri: workspaceTypesNamespaceUri,
    title: params.title,
    kind: "entityType",
  }),
  title: params.title,
  pluralTitle: params.title,
  type: "object",
  kind: "entityType",
  properties: params.properties.reduce(
    (prev, { baseUri, versionedUri, array }) => ({
      ...prev,
      [baseUri]: array
        ? {
            type: "array",
            items: { $ref: versionedUri },
            ...(array === true ? {} : array),
          }
        : { $ref: versionedUri },
    }),
    {},
  ),
  required: params.properties
    .filter(({ required }) => !!required)
    .map(({ baseUri }) => baseUri),
});

/**
 * @todo make use of new type system package for managing URI structure.
 *   https://app.asana.com/0/1202805690238892/1202892835843657/f
 */
export const incrementVersionedId = (verisonedId: string): string => {
  // Invariant: the last part of a versioned URI is /v/N where N is always a positive number
  //   with no trailing slash
  const splitAt = "/v/";

  // Given
  // "http://example.com/et/v/1"
  // find index            *
  const versionPosition = verisonedId.lastIndexOf(splitAt);

  // Given invariant and index
  // "http://example.com/et/v/1"
  //                          *
  // parse and add 1.
  const newVersion =
    parseInt(verisonedId.substring(versionPosition + splitAt.length), 10) + 1;

  // Reconstruct with base and new version
  // "http://example.com/et/v/" + "2"
  return `${verisonedId.substring(
    0,
    versionPosition + splitAt.length,
  )}${newVersion}`;
};
