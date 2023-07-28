import { VersionedUrl } from "@blockprotocol/type-system";
import { systemUserShortname } from "@local/hash-isomorphic-utils/environment";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";
import { BaseUrl } from "@local/hash-subgraph";

import { frontendUrl } from "./environment";

export type SchemaKind = "data-type" | "property-type" | "entity-type";

/**
 * Generate the base identifier of a type (its un-versioned URL).
 *
 * @param [domain] - the domain of the type, defaults the frontend url.
 * @param namespace - the namespace of the type.
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 * @param [slugOverride] - optional override for the slug used at the end of the URL
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
}): BaseUrl =>
  `${domain ?? frontendUrl}/@${namespace}/types/${kind}/${
    slugOverride ?? slugifyTypeTitle(title)
  }/` as const as BaseUrl;

/**
 * Generate the identifier of a type (its versioned URL).
 *
 * @param domain (optional) - the domain of the type, defaults the frontend url.
 * @param namespace - the namespace of the type.
 * @param kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param title - the title of the type.
 * @param [slugOverride] - optional override for the slug used at the end of the URL
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
}): VersionedUrl => {
  // We purposefully don't use `versionedUrlFromComponents` here as we want to limit the amount of functional code
  // we're calling when this package is imported (this happens every time on import, not as the result of a call).
  // We should be able to trust ourselves to create valid types here "statically", without needing to call the type
  // system to validate them.
  return `${generateBaseTypeId({
    domain,
    namespace,
    kind,
    title,
    slugOverride,
  })}v/1` as VersionedUrl;
};

/**
 * Generate the identifier of a system type (its versioned URL).
 *
 * @param args.kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param args.title - the title of the type.
 */
export const generateSystemTypeId = (args: {
  kind: SchemaKind;
  title: string;
}) => generateTypeId({ namespace: systemUserShortname, ...args });

/**
 * Generate the identifier of a block protocol type (its versioned URL).
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
 * Generate the identifier of a linear type (its versioned URL).
 *
 * @param args.kind - the "kind" of the type ("entity-type", "property-type", "link-type" or "data-type").
 * @param args.title - the title of the type.
 */
export const generateLinearTypeId = (args: {
  kind: SchemaKind;
  title: string;
}) => generateTypeId({ namespace: "linear", ...args });

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
  file: {
    title: "File",
    description: "A file.",
  },
  userSecret: {
    title: "User Secret",
    description: "A secret or credential belonging to a user.",
  },
  linearIntegration: {
    title: "Linear Integration",
    description: "An instance of an integration with Linear.",
  },
} as const;

type SystemEntityTypeKey = keyof typeof systemEntityTypes;

export type SystemEntityTypeTitle =
  (typeof systemEntityTypes)[SystemEntityTypeKey]["title"];

/**
 * The system property types.
 *
 * @todo add missing descriptions
 * @see https://app.asana.com/0/1202805690238892/1203132327925695/f
 */
const systemPropertyTypes = {
  description: {
    title: "Description",
    description: "A textual description of something",
  },
  location: {
    title: "Location",
    description: "A location for something, expressed as a single string",
  },
  website: {
    title: "Website",
    description: "A URL for a website",
  },
  shortname: {
    title: "Shortname",
    description: "A unique identifier for something, in the form of a slug",
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
  // @todo this could be a timestamp – archivedAt
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
  expiredAt: {
    title: "Expired At",
    description: "Stringified timestamp of when something expired.",
  },
  connectionSourceName: {
    title: "Connection Source Name",
    description: "The name of the connection source.",
  },
  vaultPath: {
    title: "Vault Path",
    description: "The path to a secret in Hashicorp Vault.",
  },
  linearOrgId: {
    title: "Linear Org Id",
    description: "The unique identifier for an org in Linear.",
  },
  fileUrl: {
    title: "File URL",
    description: "URL to access a file.",
  },
  fileMediaType: {
    title: "File Media Type",
    description: "Media type of a file.",
  },
  objectStoreKey: {
    title: "Object Store Key",
    description: "Unique identifier for an object in an object store.",
  },
  externalFileUrl: {
    title: "External File URL",
    description: "URL to an external file.",
  },
  fileKey: {
    title: "File Key",
    description:
      "Key used to uniquely identify a file in a third-party system.",
  },
  linearTeamId: {
    title: "Linear Team Id",
    description: "The unique identifier for a team in Linear.",
  },
} as const;

type SystemPropertyTypeKey = keyof typeof systemPropertyTypes;

export type SystemPropertyTypeTitle =
  (typeof systemPropertyTypes)[SystemPropertyTypeKey]["title"];

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
  syncLinearDataWith: {
    title: "Sync Linear Data With",
    description: "Something that syncs linear data with something.",
  },
  usesUserSecret: {
    title: "Uses User Secret",
    description: "Something that uses a user secret.",
  },
} as const;

type SystemLinkEntityTypeKey = keyof typeof systemLinkEntityTypes;

export type SystemLinkEntityTypeTitle =
  (typeof systemLinkEntityTypes)[SystemLinkEntityTypeKey];

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
  (typeof primitiveDataTypes)[PrimitiveDataTypeKey]["title"];

/**
 * The linear entity types.
 *
 * Descriptions are taken from the Linear GraphQL schema (@see https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql)
 *
 * */
const linearEntityTypes = {
  user: {
    title: "User",
    description:
      "A user that has access to the the resources of an organization.",
  },
  organization: {
    title: "Organization",
    description:
      "An organization. Organizations are root-level objects that contain user accounts and teams.",
  },
  issue: {
    title: "Issue",
    description: "An issue.",
  },
} as const;

export type LinearEntityTypeKey = keyof typeof linearEntityTypes;

export type LinearEntityTypeTitle =
  (typeof linearEntityTypes)[LinearEntityTypeKey]["title"];

/** The linear property types */
const linearPropertyTypes = {
  /** Generic */
  id: {
    title: "ID",
    description: "The unique identifier of the entity.",
  },
  archivedAt: {
    title: "Archived At",
    description:
      "The time at which the entity was archived. Null if the entity has not been archived.",
  },
  createdAt: {
    title: "Created At",
    description: "The time at which the entity was created.",
  },
  updatedAt: {
    title: "Updated At",
    description:
      "The last time at which the entity was meaningfully updated, i.e. for all changes of syncable properties except those for which updates should not produce an update to updatedAt (see skipUpdatedAtKeys). This is the same as the creation time if the entity hasn't been updated after creation.",
  },
  /** Generic (for HASH) */
  createdIssueCount: {
    title: "Created Issue Count",
    description: "Number of issues created.",
  },
  name: {
    title: "Name",
    description: "The full name of the user or the organization's name.",
  },
  url: {
    title: "URL",
    description: "URL of a user's profile or issue.",
  },
  /** User */
  active: {
    title: "Active",
    description: "Whether the user account is active or disabled (suspended).",
  },
  admin: {
    title: "Admin",
    description: "Whether the user is an organization administrator.",
  },
  avatarUrl: {
    title: "Avatar URL",
    description: "An URL to the user's avatar image.",
  },
  description: {
    title: "Description",
    description: "A short description of the user, either its title or bio.",
  },
  disableReason: {
    title: "Disable Reason",
    description: "Reason why is the account disabled.",
  },
  displayName: {
    title: "Display Name",
    description:
      "The user's display (nick) name. Unique within each organization.",
  },
  email: {
    title: "Email",
    description: "The user's email address.",
  },
  guest: {
    title: "Guest",
    description:
      "Whether the user is a guest in the workspace and limited to accessing a subset of teams.",
  },
  inviteHash: {
    title: "Invite Hash",
    description: "Unique hash for the user to be used in invite URLs.",
  },
  isMe: {
    title: "Is Me",
    description: "Whether the user is the currently authenticated user.",
  },
  lastSeen: {
    title: "Last Seen",
    description:
      "The last time the user was seen online. If null, the user is currently online.",
  },
  statusEmoji: {
    title: "Status Emoji",
    description: "The emoji to represent the user current status.",
  },
  statusLabel: {
    title: "Status Label",
    description: "The label to represent the user current status.",
  },
  statusUntilAt: {
    title: "Status Until At",
    description: "A date at which the user current status should be cleared.",
  },
  timezone: {
    title: "Timezone",
    description: "The local timezone of the user.",
  },
  /** Organization */
  allowedAuthService: {
    title: "Allowed Auth Service",
    description: "Allowed authentication provider",
  },
  deletionRequestedAt: {
    title: "Deletion Requested At",
    description:
      "The time at which deletion of the organization was requested.",
  },
  gitBranchFormat: {
    title: "Git Branch Format",
    description: "How git branches are formatted.",
  },
  gitLinkbackMessagesEnabled: {
    title: "Git Linkback Messages Enabled",
    description:
      "Whether the Git integration linkback messages should be sent to private repositories.",
  },
  gitPublicLinkbackMessagesEnabled: {
    title: "Git Public Linkback Messages Enabled",
    description:
      "Whether the Git integration linkback messages should be sent to public repositories.",
  },
  logoUrl: {
    title: "Logo URL",
    description: "The organization's logo URL.",
  },
  periodUploadVolume: {
    title: "Period Upload Volume",
    description:
      "Rolling 30-day total upload volume for the organization, in megabytes.",
  },
  previousUrlKey: {
    title: "Previous URL Key",
    description: "Previously used URL key for the organization.",
  },
  projectUpdateRemindersDay: {
    title: "Project Update Reminders Day",
    description: "The day at which to prompt for project updates.",
  },
  projectUpdateRemindersHour: {
    title: "Project Update Reminders Hour",
    description: "The hour at which to prompt for project updates.",
  },
  projectUpdatesReminderFrequency: {
    title: "Project Updates Reminder Frequency",
    description: "The frequency at which to prompt for project updates.",
  },
  releaseChannel: {
    title: "Release Channel",
    description: "The feature release channel the organization belongs to.",
  },
  roadmapEnabled: {
    title: "Roadmap Enabled",
    description: "Whether the organization is using a roadmap.",
  },
  samlEnabled: {
    title: "SAML Enabled",
    description: "Whether SAML authentication is enabled for organization.",
  },
  scimEnabled: {
    title: "SCIM Enabled",
    description: "Whether SCIM provisioning is enabled for organization.",
  },
  trialEndsAt: {
    title: "Trial Ends At",
    description: "The time at which the trial of the plus plan will end.",
  },
  urlKey: {
    title: "URL Key",
    description: "The organization's unique URL key.",
  },
  userCount: {
    title: "User Count",
    description: "Number of active users in the organization.",
  },
  /** Issue */
  autoArchivedAt: {
    title: "Auto Archived At",
    description:
      "The time at which the issue was automatically archived by the auto pruning process.",
  },
  autoClosedAt: {
    title: "Auto Closed At",
    description:
      "The time at which the issue was automatically closed by the auto pruning process.",
  },
  branchName: {
    title: "Branch Name",
    description: "Suggested branch name for the issue.",
  },
  canceledAt: {
    title: "Canceled At",
    description: "The time at which the issue was moved into canceled state.",
  },
  completedAt: {
    title: "Completed At",
    description: "The time at which the issue was moved into completed state.",
  },
  customerTicketCount: {
    title: "Customer Ticket Count",
    description:
      "Returns the number of Attachment resources which are created by customer support ticketing systems (e.g. Zendesk).",
  },
  markdownDescription: {
    title: "Markdown Description",
    description: "The issue's description in markdown format.",
  },
  dueDate: {
    title: "Due Date",
    description: "The date at which the issue is due.",
  },
  estimate: {
    title: "Estimate",
    description: "The estimate of the complexity of the issue.",
  },
  identifier: {
    title: "Identifier",
    description: "Issue's human readable identifier (e.g. ENG-123).",
  },
  number: {
    title: "Number",
    description: "The issue's unique number.",
  },
  previousIdentifier: {
    title: "Previous Identifier",
    description:
      "Previous identifier of the issue if it has been moved between teams.",
  },
  priority: {
    title: "Priority",
    description:
      "The priority of the issue. 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.",
  },
  priorityLabel: {
    title: "Priority Label",
    description: "Label for the priority.",
  },
  snoozedUntilAt: {
    title: "Snoozed Until At",
    description: "The time until an issue will be snoozed in Triage view.",
  },
  sortOrder: {
    title: "Sort Order",
    description:
      "The order of the item in relation to other items in the organization.",
  },
  startedAt: {
    title: "Started At",
    description: "The time at which the issue was moved into started state.",
  },
  startedTriageAt: {
    title: "Started Triage At",
    description: "The time at which the issue entered triage.",
  },
  subIssueSortOrder: {
    title: "Sub Issue Sort Order",
    description:
      "The order of the item in the sub-issue list. Only set if the issue has a parent.",
  },
  title: {
    title: "Title",
    description: "The issue's title.",
  },
  trashed: {
    title: "Trashed",
    description: "A flag that indicates whether the issue is in the trash bin.",
  },
  triagedAt: {
    title: "Triaged At",
    description: "The time at which the issue left triage.",
  },
} as const;

export type LinearPropertyTypeKey = keyof typeof linearPropertyTypes;

export type LinearPropertyTypeTitle =
  (typeof linearPropertyTypes)[LinearPropertyTypeKey]["title"];

/** The linear link entity types */
const linearLinkEntityTypes = {
  /** Generic (for HASH) */
  label: {
    title: "Label",
    description: "Label associated with the organization or issue.",
  },
  team: {
    title: "Team",
    description: "Team associated with the organization or issue.",
  },
  /** User */
  assignedIssue: {
    title: "Assigned Issue",
    description: "Issue assigned to the user.",
  },
  organization: {
    title: "Organization",
    description: "The organization the user belongs to.",
  },
  createdIssue: {
    title: "Created Issue",
    description: "Issue created by the user.",
  },
  /** Organization */
  hasMember: {
    title: "Has Member",
    description: "Has this entity as a member.",
  },
  /** Issue */
  assignee: {
    title: "Assignee",
    description: "The user to whom the issue is assigned to.",
  },
  attachment: {
    title: "Attachment",
    description: "Attachment associated with the issue.",
  },
  child: {
    title: "Child",
    description: "Child of the issue.",
  },
  comment: {
    title: "Comment",
    description: "Comment associated with the issue.",
  },
  creator: {
    title: "Creator",
    description: "The user who created the issue.",
  },
  cycle: {
    title: "Cycle",
    description: "The cycle that the issue is associated with.",
  },
  /** @todo: add `IssueHistory` entity type */
  // history: {
  //   title: "History",
  //   description: "History entries associated with the issue.",
  // },
  parent: {
    title: "Parent",
    description: "The parent of the issue.",
  },
  project: {
    title: "Project",
    description: "The project that the issue is associated with.",
  },
  projectMilestone: {
    title: "Project Milestone",
    description: "The projectMilestone that the issue is associated with.",
  },
  snoozedBy: {
    title: "Snoozed By",
    description: "The user who snoozed the issue.",
  },
  subscriber: {
    title: "Subscriber",
    description: "User who are subscribed to the issue.",
  },
  /** @todo: add `Favorite` entity type */
  // favorite: {
  //   title: "Favorite",
  //   description: "The users favorite associated with this issue.",
  // },
  /** @todo: add `WorkflowState` entity type */
  // state: {
  //   title: "State",
  //   description: "The workflow state that the issue is associated with.",
  // },
} as const;

export type LinearLinkEntityTypeKey = keyof typeof linearLinkEntityTypes;

export type LinearLinkEntityTypeTitle =
  (typeof linearLinkEntityTypes)[LinearLinkEntityTypeKey]["title"];

type TypeDefinition = {
  title: string;
  description?: string;
};

type EntityTypeDefinition = TypeDefinition & { entityTypeId: VersionedUrl };

type PropertyTypeDefinition = TypeDefinition & { propertyTypeId: VersionedUrl };

type DataTypeDefinition = TypeDefinition & { dataTypeId: VersionedUrl };

type LinkEntityTypeDefinition = TypeDefinition & {
  linkEntityTypeId: VersionedUrl;
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

type LinearTypeDefinitions = {
  entityType: Record<LinearEntityTypeKey, EntityTypeDefinition>;
  linkEntityType: Record<LinearLinkEntityTypeKey, LinkEntityTypeDefinition>;
  propertyType: Record<LinearPropertyTypeKey, PropertyTypeDefinition>;
};

export const linearTypes: LinearTypeDefinitions = {
  entityType: Object.entries(linearEntityTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: EntityTypeDefinition = {
        title,
        description,
        entityTypeId: generateLinearTypeId({ kind: "entity-type", title }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<LinearEntityTypeKey, EntityTypeDefinition>,
  ),
  propertyType: Object.entries(linearPropertyTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: PropertyTypeDefinition = {
        title,
        description,
        propertyTypeId: generateLinearTypeId({
          kind: "property-type",
          title,
        }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<LinearPropertyTypeKey, PropertyTypeDefinition>,
  ),
  linkEntityType: Object.entries(linearLinkEntityTypes).reduce(
    (prev, [key, { title, description }]) => {
      const definition: LinkEntityTypeDefinition = {
        title,
        description,
        linkEntityTypeId: generateLinearTypeId({
          kind: "entity-type",
          title,
        }),
      };

      return { ...prev, [key]: definition };
    },
    {} as Record<LinearLinkEntityTypeKey, LinkEntityTypeDefinition>,
  ),
};
