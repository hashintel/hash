import { VersionedUri } from "@blockprotocol/type-system-web";
import slugify from "slugify";
import { frontendUrl } from "./config";

const workspaceNamespaceName = "example";

type SchemaKind = "data-type" | "property-type" | "entity-type" | "link-type";

/** Slugify the title of a type */
const slugifyTypeTitle = (title: string): string =>
  slugify(title, { lower: true });

/**
 * Generate the identifier of a type (its versioned URI).
 *
 * @param domain (optional) - the domain of the type, defaults the frontend url.
 * @param namespace - the namespace of the type.
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 */
export const generateTypeId = ({
  domain,
  namespace,
  kind,
  title,
}: {
  domain?: string;
  namespace: string;
  kind: SchemaKind;
  title: string;
}): VersionedUri =>
  `${domain ?? frontendUrl}/@${namespace}/types/${kind}/${slugifyTypeTitle(
    title,
  )}/v/1` as const;

/**
 * Generate the identifier of a workspace type (its versioned URI).
 *
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 */
export const generateWorkspaceTypeId = (args: {
  kind: SchemaKind;
  title: string;
}) => generateTypeId({ namespace: workspaceNamespaceName, ...args });

/**
 * Generate the identifier of a block protocol type (its versioned URI).
 *
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 */
export const generateBlockProtocolTypeId = (args: {
  kind: SchemaKind;
  title: string;
}) =>
  generateTypeId({
    domain: "https://blockprotocol.org",
    namespace: "blockprotocol",
    ...args,
  });

/**
 * The workspace entity types.
 *
 * @todo add missing descriptions
 * @see https://app.asana.com/0/1202805690238892/1203132327925695/f
 */
const workspaceEntityTypes = {
  block: {
    title: "Block",
    description: undefined,
  },
  page: {
    title: "Page",
    description: undefined,
  },
  text: {
    title: "Text",
    description: undefined,
  },
  dummy: {
    title: "Dummy",
    description: undefined,
  },
  user: {
    title: "User",
    description: undefined,
  },
  org: {
    title: "Org",
    description: undefined,
  },
  orgMembership: {
    title: "Org Membership",
    description: undefined,
  },
  comment: {
    title: "Comment",
    description: undefined,
  },
} as const;

type WorkspaceEntityTypeKey = keyof typeof workspaceEntityTypes;

export type WorkspaceEntityTypeTitle =
  typeof workspaceEntityTypes[WorkspaceEntityTypeKey]["title"];

/**
 * The workspace property types.
 *
 * @todo add missing descriptions
 * @see https://app.asana.com/0/1202805690238892/1203132327925695/f
 */
const workspacePropertyTypes = {
  shortName: {
    title: "Shortname",
    description: undefined,
  },
  email: {
    title: "Email",
    description: undefined,
  },
  kratosIdentityId: {
    title: "Kratos Identity Id",
    description: undefined,
  },
  preferredName: {
    title: "Preferred Name",
    description: undefined,
  },
  orgName: {
    title: "Organization Name",
    description: undefined,
  },
  orgSize: {
    title: "Organization Size",
    description: undefined,
  },
  orgProvidedInfo: {
    title: "Organization Provided Information",
    description: undefined,
  },
  responsibility: {
    title: "Responsibility",
    description: `The user's responsibility at the organization (e.g. "Marketing", "Sales", "Engineering", etc.)`,
  },
  componentId: {
    title: "Component Id",
    description: undefined,
  },
  archived: {
    title: "Archived",
    description: "Whether or not something has been archived.",
  },
  summary: {
    title: "Summary",
    description: "The summary of the something.",
  },
  title: {
    title: "Title",
    description: "The title of something.",
  },
  index: {
    title: "Index",
    description:
      "The (fractional) index indicating the current position of something.",
  },
  icon: {
    title: "Icon",
    description: "An emoji icon.",
  },
  tokens: {
    title: "Tokens",
    description: undefined,
  },
  resolvedAt: {
    title: "Resolved At",
    description: "Stringified timestamp of when something was resolved.",
  },
} as const;

type WorkspacePropertyTypeKey = keyof typeof workspacePropertyTypes;

export type WorkspacePropertyTypeTitle =
  typeof workspacePropertyTypes[WorkspacePropertyTypeKey]["title"];

/**
 * The workspace link type titles.
 */
const workspaceLinkTypes = {
  hasMembership: {
    title: "Has Membership",
    description: "Having a membership.",
  },
  ofOrg: {
    title: "Of Org",
    description: "Belonging to an organization",
  },
  blockData: {
    title: "Block Data",
    description: "The entity representing the data in a block.",
  },
  contains: {
    title: "Contains",
    description: "Something containing something.",
  },
  parent: {
    title: "Parent",
    description: "The parent of something.",
  },
  hasText: {
    title: "Has Text",
    description: "Something that has text.",
  },
  author: {
    title: "Author",
    description: "The author of something.",
  },
} as const;

type WorkspaceLinkTypeKey = keyof typeof workspaceLinkTypes;

export type WorkspaceLinkTypeTitle =
  typeof workspaceLinkTypes[WorkspaceLinkTypeKey];

/**
 * The primitive data types ("Text", "Number", etc.)
 */
const primitiveDataTypes = {
  text: {
    title: "Text",
    description: "An ordered sequence of characters",
  },
  number: {
    title: "Number",
    description: "An arithmetical value (in the Real number system)",
  },
  boolean: {
    title: "Boolean",
    description: "A True or False value",
  },
  emptyList: {
    title: "Empty List",
    description: "An Empty List",
  },
  object: {
    title: "Object",
    description: "A plain JSON object with no pre-defined structure",
  },
  null: {
    title: "Null",
    description: "A placeholder value representing 'nothing'",
  },
} as const;

export type PrimitiveDataTypeKey = keyof typeof primitiveDataTypes;

export type PrimitiveDataTypeTitle =
  typeof primitiveDataTypes[PrimitiveDataTypeKey]["title"];

type TypeDefinition = {
  title: string;
  description?: string;
};

type EntityTypeDefinition = TypeDefinition & { entityTypeId: VersionedUri };

type PropertyTypeDefinition = TypeDefinition & { propertyTypeId: VersionedUri };

type DataTypeDefinition = TypeDefinition & { dataTypeId: VersionedUri };

type LinkTypeDefinition = TypeDefinition & {
  linkTypeId: VersionedUri;
  description: string;
};

type TypeDefinitions = {
  entityType: Record<WorkspaceEntityTypeKey, EntityTypeDefinition>;
  propertyType: Record<WorkspacePropertyTypeKey, PropertyTypeDefinition>;
  linkType: Record<WorkspaceLinkTypeKey, LinkTypeDefinition>;
  dataType: Record<PrimitiveDataTypeKey, DataTypeDefinition>;
};

/**
 * The workspace and block protocol types that are statically available at run-time.
 */
export const types: TypeDefinitions = {
  entityType: Object.entries(workspaceEntityTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: EntityTypeDefinition = {
        title,
        description,
        entityTypeId: generateWorkspaceTypeId({ kind: "entity-type", title }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<WorkspaceEntityTypeKey, EntityTypeDefinition>,
  ),
  propertyType: Object.entries(workspacePropertyTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: PropertyTypeDefinition = {
        title,
        description,
        propertyTypeId: generateWorkspaceTypeId({
          kind: "property-type",
          title,
        }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<WorkspacePropertyTypeKey, PropertyTypeDefinition>,
  ),
  dataType: Object.entries(primitiveDataTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: DataTypeDefinition = {
        title,
        description,
        dataTypeId: generateBlockProtocolTypeId({
          kind: "data-type",
          title,
        }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<PrimitiveDataTypeKey, DataTypeDefinition>,
  ),
  linkType: Object.entries(workspaceLinkTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: LinkTypeDefinition = {
        title,
        description,
        linkTypeId: generateWorkspaceTypeId({
          kind: "link-type",
          title,
        }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<WorkspaceLinkTypeKey, LinkTypeDefinition>,
  ),
};
