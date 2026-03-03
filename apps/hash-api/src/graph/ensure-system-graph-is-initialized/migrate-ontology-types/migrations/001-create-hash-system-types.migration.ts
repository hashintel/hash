import { getDataTypeById } from "@local/hash-graph-sdk/data-type";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashDataTypeId,
} from "../util";

/**
 * @todo H-4065 / H-4066: Support array and tuple data types (add /list/ here, which they should inherit from)
 */
const blockProtocolDataTypeIds = [
  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
  "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1",
] as const;

const blockProtocolEntityTypeIds = [
  "https://blockprotocol.org/@hash/types/entity-type/query/v/1",
  "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1",
] as const;

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /** HASH Instance entity type */

  const pagesAreEnabledPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Pages Are Enabled",
        description:
          "Whether or not user functionality related to pages is enabled.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const userSelfRegistrationIsEnabledPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "User Self Registration Is Enabled",
        description:
          "Whether or not user self registration (sign-up) is enabled.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "h",
      migrationState,
    });

  const orgSelfRegistrationIsEnabledPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Org Self Registration Is Enabled",
        description:
          "Whether or not a user can self-register an org (note this does not apply to instance admins).",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "h",
      migrationState,
    });

  const userRegistrationByInviteIsEnabledPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "User Registration By Invitation Is Enabled",
        description:
          "Whether or not a user is able to register another user by inviting them to an org.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "h",
      migrationState,
    });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "HASH Instance",
      description: "An instance of HASH.",
      properties: [
        {
          propertyType: pagesAreEnabledPropertyType,
          required: true,
        },
        {
          propertyType: userSelfRegistrationIsEnabledPropertyType,
          required: true,
        },
        {
          propertyType: orgSelfRegistrationIsEnabledPropertyType,
          required: true,
        },
        {
          propertyType: userRegistrationByInviteIsEnabledPropertyType,
          required: true,
        },
      ],
      outgoingLinks: [],
    },
    webShortname: "h",
    migrationState,
  });

  /** File entity type */

  const fileStorageBucketPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "File Storage Bucket",
        description: "The bucket in which a file is stored.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const fileStorageEndpointPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "File Storage Endpoint",
        description:
          "The endpoint for making requests to a file storage provider.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const fileStorageForcePathStylePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "File Storage Force Path Style",
        description:
          "Whether to force path style for requests to a file storage provider (vs virtual host style).",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "h",
      migrationState,
    });

  const fileStorageKeyPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "File Storage Key",
        description: "The key identifying a file in storage.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const fileStorageProviderPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "File Storage Provider",
        description: "The provider of a file storage service.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const fileStorageRegionPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "File Storage Region",
        description: "The region in which a file is stored.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const fileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "File",
        titlePlural: "Files",
        description: "A file hosted at a URL",
        icon: "/icons/types/file.svg",
        labelProperty:
          blockProtocolPropertyTypes.displayName.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.fileUrl.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
          },
          {
            propertyType: blockProtocolPropertyTypes.mimeType.propertyTypeId,
          },
          {
            propertyType: fileStorageBucketPropertyType,
          },
          {
            propertyType: fileStorageEndpointPropertyType,
          },
          {
            propertyType: fileStorageForcePathStylePropertyType,
          },
          {
            propertyType: fileStorageKeyPropertyType,
          },
          {
            propertyType: fileStorageProviderPropertyType,
          },
          {
            propertyType: fileStorageRegionPropertyType,
          },
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/v/1",
          },
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
          },
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/v/1",
          },
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/v/1",
          },
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/v/1",
          },
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/v/1",
          },
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/v/1",
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Image File entity type */

  const imageFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [fileEntityType.schema.$id],
        title: "Image File",
        titlePlural: "Image Files",
        icon: "/icons/types/file-image.svg",
        description: "An image file hosted at a URL",
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Block entity type */

  const componentIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Component Id",
        description: "An identifier for a component.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasDataLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Data",
        inverse: {
          title: "Data For",
        },
        description: "The data that something has.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const blockEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Block",
        titlePlural: "Blocks",
        icon: "/icons/types/cube.svg",
        description:
          "A block that displays or otherwise uses data, part of a wider page or collection.",
        properties: [
          {
            propertyType: componentIdPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasDataLinkEntityType,
            minItems: 1,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Block Collection entity type */

  const blockCollectionEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Block Collection",
        titlePlural: "Block Collections",
        icon: "/icons/types/cubes.svg",
        description: "A collection of blocks.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Profile Bio entity type */

  const fractionalIndexPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Fractional Index",
        description:
          "The fractional index indicating the current position of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasIndexedContentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Indexed Content",
        inverse: {
          title: "Indexed Content For",
        },
        description: "Something contained at an index by something",
        properties: [
          {
            propertyType: fractionalIndexPropertyType,
            required: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  const profileBioEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockCollectionEntityType.schema.$id],
        title: "Profile Bio",
        titlePlural: "Profile Bios",
        icon: "/icons/types/memo-circle-info.svg",
        description:
          "A biography for display on someone or something's profile.",
        outgoingLinks: [
          {
            linkEntityType: hasIndexedContentLinkEntityType,
            destinationEntityTypes: [blockEntityType],
            minItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Organization entity type */

  const shortnamePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Shortname",
        description: "A unique identifier for something, in the form of a slug",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const orgNamePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Organization Name",
        description: "The name of an organization.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const locationPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Location",
        description: "A location for something, expressed as a single string",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const uriDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "uri",
    migrationState,
  });

  const websiteUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Website URL",
        description: "A URL for a website",
        possibleValues: [{ dataTypeId: uriDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const pinnedEntityTypeBaseUrlPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Pinned Entity Type Base URL",
        description: "The base URL of a pinned entity type.",
        possibleValues: [{ dataTypeId: uriDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    });

  const hasAvatarLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Avatar",
        inverse: {
          title: "Avatar For",
        },
        description: "The avatar something has.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasCoverImageLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Cover Image",
        inverse: {
          title: "Cover Image For",
        },
        description: "The cover image something has.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasBioLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Bio",
        inverse: {
          title: "Bio For",
        },
        description: "The biography something has.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const orgEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Organization",
        titlePlural: "Organizations",
        icon: "/icons/types/people-group.svg",
        labelProperty: systemPropertyTypes.organizationName.propertyTypeBaseUrl,
        description:
          "An organization. Organizations are root-level objects that contain user accounts and teams.",
        properties: [
          {
            propertyType: shortnamePropertyType,
            required: true,
          },
          {
            propertyType: orgNamePropertyType,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: false,
          },
          {
            propertyType: locationPropertyType,
            required: false,
          },
          {
            propertyType: websiteUrlPropertyType,
            required: false,
          },
          {
            propertyType: pinnedEntityTypeBaseUrlPropertyType,
            array: { maxItems: 5 },
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasAvatarLinkEntityType,
            destinationEntityTypes: [imageFileEntityType],
            maxItems: 1,
            minItems: 0,
          },
          {
            linkEntityType: hasCoverImageLinkEntityType,
            destinationEntityTypes: [imageFileEntityType],
            maxItems: 1,
            minItems: 0,
          },
          {
            linkEntityType: hasBioLinkEntityType,
            destinationEntityTypes: [profileBioEntityType],
            minItems: 0,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Service Account entity type */

  const profileUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Profile URL",
        description: "A URL to a profile",
        possibleValues: [{ dataTypeId: uriDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const serviceAccountEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Service Account",
        titlePlural: "Service Accounts",
        icon: "/icons/types/person-to-portal.svg",
        description: "A service account.",
        properties: [
          {
            propertyType: profileUrlPropertyType,
            /**
             * @todo: we may want to make this optional in the future, when
             * we allow child types to set inherited properties to required
             */
            required: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Linked In Account entity type */

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      allOf: [serviceAccountEntityType.schema.$id],
      title: "LinkedIn Account",
      titlePlural: "LinkedIn Accounts",
      icon: "/icons/types/linkedin.svg",
      description: "A LinkedIn account.",
    },
    webShortname: "h",
    migrationState,
  });

  /** Twitter Account entity type */

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      allOf: [serviceAccountEntityType.schema.$id],
      title: "Twitter Account",
      titlePlural: "Twitter Accounts",
      icon: "/icons/types/x-twitter.svg",
      description: "A Twitter account.",
    },
    webShortname: "h",
    migrationState,
  });

  /** TikTok Account entity type */

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      allOf: [serviceAccountEntityType.schema.$id],
      title: "TikTok Account",
      titlePlural: "TikTok Accounts",
      icon: "/icons/types/tiktok.svg",
      description: "A TikTok account.",
    },
    webShortname: "h",
    migrationState,
  });

  /** Facebook Account entity type */

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      allOf: [serviceAccountEntityType.schema.$id],
      title: "Facebook Account",
      titlePlural: "Facebook Accounts",
      icon: "/icons/types/facebook.svg",
      description: "A Facebook account.",
    },
    webShortname: "h",
    migrationState,
  });

  /** Instagram Account entity type */

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      allOf: [serviceAccountEntityType.schema.$id],
      title: "Instagram Account",
      titlePlural: "Instagram Accounts",
      icon: "/icons/types/instagram.svg",
      description: "An Instagram account.",
    },
    webShortname: "h",
    migrationState,
  });

  /** GitHub Account entity type */

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      allOf: [serviceAccountEntityType.schema.$id],
      title: "GitHub Account",
      titlePlural: "GitHub Accounts",
      icon: "/icons/types/github.svg",
      description: "A GitHub account.",
    },
    webShortname: "h",
    migrationState,
  });

  /** User entity type */

  const emailDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "email",
    migrationState,
  });

  const emailPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Email",
        description: "An email address",
        possibleValues: [{ dataTypeId: emailDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const kratosIdentityIdPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Kratos Identity Id",
        description: "An identifier for a record in Ory Kratos.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const preferredNamePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Preferred Name",
        description: "The preferred name of someone or something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const preferredPronounsPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Preferred Pronouns",
        description: "Someone's preferred pronouns.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const isMemberOfLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Is Member Of",
        inverse: {
          title: "Has Member",
        },
        description: "Something that someone or something is a member of.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasServiceAccountLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Service Account",
        inverse: {
          title: "Service Account For",
        },
        description: "The service account something has.",
      },
      webShortname: "h",
      migrationState,
    });

  const userEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "User",
        titlePlural: "Users",
        icon: "/icons/types/user.svg",
        description: "A user of the HASH application.",
        properties: [
          {
            propertyType: shortnamePropertyType,
          },
          {
            propertyType: emailPropertyType,
            required: true,
            array: { minItems: 1 },
          },
          {
            propertyType: kratosIdentityIdPropertyType,
            required: true,
          },
          {
            propertyType: preferredNamePropertyType,
          },
          {
            propertyType: preferredPronounsPropertyType,
          },
          {
            propertyType: locationPropertyType,
          },
          {
            propertyType: websiteUrlPropertyType,
          },
          {
            propertyType: pinnedEntityTypeBaseUrlPropertyType,
            array: { maxItems: 5 },
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: isMemberOfLinkEntityType,
            destinationEntityTypes: [orgEntityType],
          },
          {
            linkEntityType: hasAvatarLinkEntityType,
            destinationEntityTypes: [imageFileEntityType],
            maxItems: 1,
            minItems: 0,
          },
          {
            linkEntityType: hasCoverImageLinkEntityType,
            destinationEntityTypes: [imageFileEntityType],
            maxItems: 1,
            minItems: 0,
          },
          {
            linkEntityType: hasServiceAccountLinkEntityType,
            destinationEntityTypes: [serviceAccountEntityType],
          },
          {
            linkEntityType: hasBioLinkEntityType,
            destinationEntityTypes: [profileBioEntityType],
            minItems: 0,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Text entity type */

  const textEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Text",
        titlePlural: "Texts",
        icon: "/icons/types/text.svg",
        description: "An ordered sequence of characters.",
        properties: [
          {
            propertyType:
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2",
            required: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Page entity type */

  const archivedPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        possibleValues: [{ primitiveDataType: "boolean" }],
        title: "Archived",
        description: "Whether or not something has been archived.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const summaryPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Summary",
        description: "The summary of the something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const titlePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Title",
        description: "The title of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const iconPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Icon",
        description: "An emoji icon.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasParentLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Parent",
        inverse: {
          title: "Parent Of",
        },
        description: "The parent something has.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const pageEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockCollectionEntityType.schema.$id],
        title: "Page",
        titlePlural: "Pages",
        icon: "/icons/types/page.svg",
        labelProperty: systemPropertyTypes.title.propertyTypeBaseUrl,
        description:
          "A page for displaying and potentially interacting with data.",
        properties: [
          {
            propertyType: summaryPropertyType,
          },
          {
            propertyType: archivedPropertyType,
          },
          {
            propertyType: iconPropertyType,
          },
          {
            propertyType: titlePropertyType,
            required: true,
          },
          {
            propertyType: fractionalIndexPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasParentLinkEntityType,
            destinationEntityTypes: ["SELF_REFERENCE"],
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Document entity type */

  const _documentEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Document",
        titlePlural: "Documents",
        description:
          "A page in document format, with content arranged in columns.",
        allOf: [pageEntityType.schema.$id],
        outgoingLinks: [
          {
            linkEntityType: hasIndexedContentLinkEntityType,
            destinationEntityTypes: [blockEntityType],
            minItems: 0,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Canvas entity type */

  const xPositionPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "X Position",
        description: "The position of something on the x axis.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const yPositionPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Y Position",
        description: "The position of something on the y axis.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const heightInPixelsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Height In Pixels",
        description: "The height of something in pixels.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const widthInPixelsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Width In Pixels",
        description: "The width of something in pixels.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const rotationInRadsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Rotation In Rads",
        description: "The rotation of something in radians.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasSpatiallyPositionedContentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Spatially Positioned Content",
        inverse: {
          title: "Spatially Positioned Content For",
        },
        description: "Something contained at a spatial position by something",
        properties: [
          {
            propertyType: xPositionPropertyType,
            required: true,
          },
          {
            propertyType: yPositionPropertyType,
            required: true,
          },
          {
            propertyType: heightInPixelsPropertyType,
            required: true,
          },
          {
            propertyType: widthInPixelsPropertyType,
            required: true,
          },
          {
            propertyType: rotationInRadsPropertyType,
            required: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  const _canvasEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Canvas",
        titlePlural: "Canvases",
        icon: "/icons/types/rectangle.svg",
        description:
          "A page in canvas format, with content in a free-form arrangement.",
        allOf: [pageEntityType.schema.$id],
        outgoingLinks: [
          {
            linkEntityType: hasSpatiallyPositionedContentLinkEntityType,
            destinationEntityTypes: [blockEntityType],
            minItems: 0,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Quick Note entity */

  const _quickNoteEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockCollectionEntityType.schema.$id],
        title: "Note",
        titlePlural: "Notes",
        icon: "/icons/types/note-sticky.svg",
        description: "A (usually) quick or short note.",
        properties: [{ propertyType: archivedPropertyType }],
        outgoingLinks: [
          {
            linkEntityType: hasIndexedContentLinkEntityType,
            destinationEntityTypes: [blockEntityType],
            minItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const dateTimeDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "datetime",
    migrationState,
  });

  const expiredAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Expired At",
        description: "Stringified timestamp of when something expired.",
        possibleValues: [{ dataTypeId: dateTimeDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const connectionSourceNamePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Connection Source Name",
        description: "The name of the connection source.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const vaultPathPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Vault Path",
        description: "The path to a secret in Hashicorp Vault.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const linearTeamIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Linear Team Id",
        description: "The unique identifier for a team in Linear.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const syncLinearDataWithLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Sync Linear Data With",
        description: "Something that syncs linear data with something.",
        properties: [
          {
            propertyType: linearTeamIdPropertyType,
            array: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  const usesUserSecretLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Uses User Secret",
        inverse: {
          title: "Used By",
        },
        description: "The user secret something uses.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const userSecretEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "User Secret",
        titlePlural: "User Secrets",
        icon: "/icons/types/user-lock.svg",
        description: "A secret or credential belonging to a user.",
        properties: [
          {
            propertyType: expiredAtPropertyType,
            required: true,
          },
          {
            propertyType: connectionSourceNamePropertyType,
            required: true,
          },
          {
            propertyType: vaultPathPropertyType,
            required: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const linearOrgIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Linear Org Id",
        description: "The unique identifier for an org in Linear.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const _linearIntegrationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Linear Integration",
        description: "An instance of an integration with Linear.",
        properties: [
          {
            propertyType: linearOrgIdPropertyType,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: syncLinearDataWithLinkEntityType,
            destinationEntityTypes: [userEntityType, orgEntityType],
          },
          {
            linkEntityType: usesUserSecretLinkEntityType,
            destinationEntityTypes: [userSecretEntityType],
            minItems: 1,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Comment entity type */

  const resolvedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Resolved At",
        description: "Stringified timestamp of when something was resolved.",
        possibleValues: [{ dataTypeId: dateTimeDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const deletedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Deleted At",
        description: "Stringified timestamp of when something was deleted.",
        possibleValues: [{ dataTypeId: dateTimeDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasTextLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Text",
        inverse: {
          title: "Text For",
        },
        description: "The text something has.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const authoredByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Authored By",
        icon: "/icons/types/pen.svg",
        inverse: {
          title: "Author Of",
        },
        description: "What or whom something was authored by.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const commentEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Comment",
        titlePlural: "Comments",
        icon: "/icons/types/comment.svg",
        description: "Comment associated with the issue.",
        properties: [
          {
            propertyType: resolvedAtPropertyType,
          },
          {
            propertyType: deletedAtPropertyType,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasTextLinkEntityType,
            destinationEntityTypes: [textEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: hasParentLinkEntityType,
            destinationEntityTypes: ["SELF_REFERENCE", blockEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: authoredByLinkEntityType,
            destinationEntityTypes: [userEntityType],
            minItems: 1,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Notification entity type */

  const readAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Read At",
        description: "The timestamp of when something was read.",
        possibleValues: [{ dataTypeId: dateTimeDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const notificationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Notification",
        titlePlural: "Notifications",
        icon: "/icons/types/megaphone.svg",
        description: "A notification to a user.",
        properties: [
          {
            propertyType: archivedPropertyType,
          },
          {
            propertyType: readAtPropertyType,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Mention Notification entity type */

  const occurredInEntityLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Occurred In Entity",
        inverse: {
          title: "Location Of",
        },
        description: "An entity that something occurred in.",
      },
      webShortname: "h",
      migrationState,
    });

  const occurredInBlockLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Occurred In Block",
        inverse: {
          title: "Location Of",
        },
        description: "A block that something occurred in.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const occurredInCommentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Occurred In Comment",
        inverse: {
          title: "Location Of",
        },
        description: "A comment that something occurred in.",
      },
      webShortname: "h",
      migrationState,
    });

  const occurredInTextLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Occurred In Text",
        inverse: {
          title: "Location Of",
        },
        description: "Text that something occurred in.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const triggeredByUserLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Triggered By User",
        inverse: {
          title: "Triggered",
        },
        description: "A user that triggered something.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const _mentionNotificationEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [notificationEntityType.schema.$id],
        title: "Mention Notification",
        titlePlural: "Mention Notifications",
        description: "A notification that a user was mentioned somewhere.",
        outgoingLinks: [
          {
            linkEntityType: occurredInEntityLinkEntityType,
            destinationEntityTypes: [pageEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: occurredInBlockLinkEntityType,
            destinationEntityTypes: [blockEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: occurredInCommentLinkEntityType,
            destinationEntityTypes: [commentEntityType],
            minItems: 0,
            maxItems: 1,
          },
          {
            linkEntityType: occurredInTextLinkEntityType,
            destinationEntityTypes: [textEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: triggeredByUserLinkEntityType,
            destinationEntityTypes: [userEntityType],
            minItems: 1,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  /** Comment Notification entity type */

  const triggeredByCommentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Triggered By Comment",
        inverse: {
          title: "Triggered",
        },
        description: "A comment that triggered something.",
      },
      webShortname: "h",
      migrationState,
    });

  const repliedToCommentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Replied To Comment",
        inverse: {
          title: "Replied To By",
        },
        description: "The comment that something replied to.",
      },
      webShortname: "h",
      migrationState,
    });

  const _commentNotificationEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Comment Notification",
        titlePlural: "Comment Notifications",
        description: "A notification related to a comment.",
        allOf: [notificationEntityType.schema.$id],
        outgoingLinks: [
          {
            linkEntityType: occurredInEntityLinkEntityType,
            destinationEntityTypes: [pageEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: occurredInBlockLinkEntityType,
            destinationEntityTypes: [blockEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: triggeredByCommentLinkEntityType,
            destinationEntityTypes: [commentEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: triggeredByUserLinkEntityType,
            destinationEntityTypes: [userEntityType],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: repliedToCommentLinkEntityType,
            destinationEntityTypes: [commentEntityType],
            minItems: 0,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  /**
   * Ensure the primitive BP data types are loaded
   */
  await Promise.all([
    ...blockProtocolDataTypeIds.map(async (dataTypeId) => {
      const existingDataType = await getDataTypeById(
        context.graphApi,
        authentication,
        {
          dataTypeId,
          temporalAxes: fullTransactionTimeAxis,
        },
      );

      if (existingDataType) {
        return;
      }

      return context.graphApi.loadExternalDataType(authentication.actorId, {
        dataTypeId,
      });
    }),
    ...blockProtocolEntityTypeIds.map(async (entityTypeId) => {
      const existingEntityType = await getEntityTypeById(
        context.graphApi,
        authentication,
        {
          entityTypeId,
          temporalAxes: fullTransactionTimeAxis,
        },
      );

      if (existingEntityType) {
        return;
      }

      return context.graphApi.loadExternalEntityType(authentication.actorId, {
        entityTypeId,
      });
    }),
  ]);

  return migrationState;
};

export default migrate;
