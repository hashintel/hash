import { BaseUri, VersionedUri } from "@blockprotocol/type-system";
import { systemUserShortname } from "@hashintel/hash-shared/environment";
import slugify from "slugify";

import { frontendUrl } from "./environment";

export type SchemaKind = "data-type" | "property-type" | "entity-type";

/** Slugify the title of a type */
export const slugifyTypeTitle = (title: string): string =>
  slugify(title, { lower: true });

/**
 * Generate the base identifier of a type (its un-versioned URI).
 *
 * @param [domain] - the domain of the type, defaults the frontend url.
 * @param namespace - the namespace of the type.
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 * @param [slugOverride] - optional override for the slug used at the end of the URI
 */
export const generateBaseTypeId = ({
  domain,
  namespace,
  kind,
  title,
  slugOverride,
}: {
  domain?: string;
  namespace: string;
  kind: SchemaKind;
  title: string;
  slugOverride?: string;
}): BaseUri =>
  `${domain ?? frontendUrl}/@${namespace}/types/${kind}/${
    slugOverride ?? slugifyTypeTitle(title)
  }/` as const;

/**
 * Generate the identifier of a type (its versioned URI).
 *
 * @param domain (optional) - the domain of the type, defaults the frontend url.
 * @param namespace - the namespace of the type.
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 * @param [slugOverride] - optional override for the slug used at the end of the URI
 */
export const generateTypeId = ({
  domain,
  namespace,
  kind,
  title,
  slugOverride,
}: {
  domain?: string;
  namespace: string;
  kind: SchemaKind;
  title: string;
  slugOverride?: string;
}): VersionedUri => {
  // We purposefully don't use `versionedUriFromComponents` here as we want to limit the amount of functional code
  // we're calling when this package is imported (this happens every time on import, not as the result of a call).
  // We should be able to trust ourselves to create valid types here "statically", without needing to call the type
  // system to validate them.
  return `${generateBaseTypeId({
    domain,
    namespace,
    kind,
    title,
    slugOverride,
  })}v/1` as VersionedUri;
};

/**
 * Generate the identifier of a system type (its versioned URI).
 *
 * @param args.kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param args.title - the title of the type.
 */
export const generateSystemTypeId = (args: {
  kind: SchemaKind;
  title: string;
}) => generateTypeId({ namespace: systemUserShortname, ...args });

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
 * The system entity types.
 *
 * @todo add missing descriptions
 * @see https://app.asana.com/0/1202805690238892/1203132327925695/f
 */
const systemEntityTypes = {
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
  user: {
    title: "User",
    description: undefined,
  },
  org: {
    title: "Org",
    description: undefined,
  },
  comment: {
    title: "Comment",
    description: undefined,
  },
  hashInstance: {
    title: "HASH Instance",
    description: "An instance of HASH.",
  },
} as const;

type SystemEntityTypeKey = keyof typeof systemEntityTypes;

export type SystemEntityTypeTitle =
  typeof systemEntityTypes[SystemEntityTypeKey]["title"];

/**
 * The system property types.
 *
 * @todo add missing descriptions
 * @see https://app.asana.com/0/1202805690238892/1203132327925695/f
 */
const systemPropertyTypes = {
  shortName: {
    title: "Shortname",
    description: undefined,
  },
  email: {
    title: "Email",
    description: undefined,
  },
  userSelfRegistrationIsEnabled: {
    title: "User Self Registration Is Enabled",
    description: "Whether or not user self registration (sign-up) is enabled.",
  },
  userRegistrationByInviteIsEnabled: {
    title: "User Registration By Invitation Is Enabled",
    description:
      "Whether or not a user is able to register another user by inviting them to an org.",
  },
  orgSelfRegistrationIsEnabled: {
    title: "Org Self Registration Is Enabled",
    description:
      "Whether or not a user can self-register an org (note this does not apply to instance admins).",
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
  deletedAt: {
    title: "Deleted At",
    description: "Stringified timestamp of when something was deleted.",
  },
} as const;

type SystemPropertyTypeKey = keyof typeof systemPropertyTypes;

export type SystemPropertyTypeTitle =
  typeof systemPropertyTypes[SystemPropertyTypeKey]["title"];

/**
 * The system link entity type titles.
 */
const systemLinkEntityTypes = {
  orgMembership: {
    title: "Org Membership",
    description: undefined,
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
  admin: {
    title: "Admin",
    description: "The admin of something.",
  },
} as const;

type SystemLinkEntityTypeKey = keyof typeof systemLinkEntityTypes;

export type SystemLinkEntityTypeTitle =
  typeof systemLinkEntityTypes[SystemLinkEntityTypeKey];

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

type LinkEntityTypeDefinition = TypeDefinition & {
  linkEntityTypeId: VersionedUri;
};

type TypeDefinitions = {
  entityType: Record<SystemEntityTypeKey, EntityTypeDefinition>;
  linkEntityType: Record<SystemLinkEntityTypeKey, LinkEntityTypeDefinition>;
  propertyType: Record<SystemPropertyTypeKey, PropertyTypeDefinition>;
  dataType: Record<PrimitiveDataTypeKey, DataTypeDefinition>;
};

/**
 * The system and block protocol types that are statically available at run-time.
 */
export const types: TypeDefinitions = {
  entityType: Object.entries(systemEntityTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: EntityTypeDefinition = {
        title,
        description,
        entityTypeId: generateSystemTypeId({ kind: "entity-type", title }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<SystemEntityTypeKey, EntityTypeDefinition>,
  ),
  propertyType: Object.entries(systemPropertyTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: PropertyTypeDefinition = {
        title,
        description,
        propertyTypeId: generateSystemTypeId({
          kind: "property-type",
          title,
        }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<SystemPropertyTypeKey, PropertyTypeDefinition>,
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
  linkEntityType: Object.entries(systemLinkEntityTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: LinkEntityTypeDefinition = {
        title,
        description,
        linkEntityTypeId: generateSystemTypeId({
          kind: "entity-type",
          title,
        }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<SystemLinkEntityTypeKey, LinkEntityTypeDefinition>,
  ),
};
