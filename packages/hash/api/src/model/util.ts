import {
  EntityType,
  PropertyType,
  DataType,
  LinkType,
} from "@hashintel/hash-graph-client";
import slugify from "slugify";

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
 * @todo: create workspace types in an account that's dedciated to
 * the HASH workspace. For now we're just chucking them in the root account.
 */
export const workspaceAccountId = nilUuid;

export const worskspaceTypesNamespaceUri =
  "https://example.com/@workspace/types";

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

const slugifySchemaTitle = (title: string): string =>
  slugify(title.toLowerCase());

export const generateSchemaBaseUri = (params: {
  namespaceUri: string;
  kind: SchemaKind;
  title: string;
}) =>
  `${params.namespaceUri}/${schemaKindSlugs[params.kind]}/${slugifySchemaTitle(
    params.title,
  )}`;

export const generateSchemaVersionedUri = (params: {
  namespaceUri: string;
  kind: SchemaKind;
  title: string;
  version?: number;
}) => `${generateSchemaBaseUri(params)}/v/${params.version ?? 1}`;

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
 * @param params
 * @returns
 */
export const generateWorkspacePropertyTypeSchema = (params: {
  title: string;
  /** @todo: account for nested property types (once we have a use-case) */
  possibleValues: {
    primitiveDataType: PrimitiveDataTypeTitle;
    array?: boolean;
  }[];
}): PropertyType => ({
  $id: generateSchemaVersionedUri({
    namespaceUri: worskspaceTypesNamespaceUri,
    title: params.title,
    kind: "propertyType",
  }),
  kind: "propertyType",
  title: params.title,
  oneOf: params.possibleValues.map(({ array, primitiveDataType }) =>
    array
      ? {
          type: "array",
          items: {
            oneOf: [
              {
                $ref: primitiveDataTypeVersionedUris[primitiveDataType],
              },
            ],
          },
        }
      : {
          $ref: primitiveDataTypeVersionedUris[primitiveDataType],
        },
  ),
});

/**
 * Helper method for generating an entity schema for the Graph API.
 *
 * @param params
 * @returns
 */
export const generateWorkspaceEntityTypeSchema = (params: {
  title: string;
  properties: {
    baseUri: string;
    versionedUri: string;
    required?: boolean;
    array?: boolean;
    minItems?: number;
    maxItems?: number;
  }[];
}): EntityType => ({
  $id: generateSchemaVersionedUri({
    namespaceUri: worskspaceTypesNamespaceUri,
    title: params.title,
    kind: "entityType",
  }),
  title: params.title,
  type: "object",
  kind: "entityType",
  properties: params.properties.reduce(
    (prev, { baseUri, versionedUri, array, minItems, maxItems }) => ({
      ...prev,
      [baseUri]: array
        ? {
            type: "array",
            items: { $ref: versionedUri },
            minItems,
            maxItems,
          }
        : { $ref: versionedUri },
    }),
    {},
  ),
  required: params.properties
    .filter(({ required }) => !!required)
    .map(({ baseUri }) => baseUri),
});
