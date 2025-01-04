import {
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  descriptionPropertyTypeUrl,
  fileNamePropertyTypeUrl,
  fileUrlPropertyTypeUrl,
  linkEntityTypeUrl,
  mimeTypePropertyTypeUrl,
} from "@local/hash-subgraph";

import { systemAccountId } from "../../../system-account";
import type { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
} from "../util";

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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
    webShortname: "hash",
    migrationState,
    instantiator: {
      kind: "account",
      subjectId: systemAccountId,
    },
  });

  /** File entity type */

  const fileStorageBucketPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "File Storage Bucket",
        description: "The bucket in which a file is stored.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
    });

  const fileStorageRegionPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "File Storage Region",
        description: "The region in which a file is stored.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
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
            propertyType: fileUrlPropertyTypeUrl,
            required: true,
          },
          {
            propertyType: descriptionPropertyTypeUrl,
          },
          {
            propertyType: mimeTypePropertyTypeUrl,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
    },
  );

  const hasDataLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Data",
        titlePlural: "Has Datas",
        inverse: {
          title: "Data For",
          titlePlural: "Data Fors",
        },
        description: "The data that something has.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
    },
  );

  const hasIndexedContentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Indexed Content",
        titlePlural: "Has Indexed Contents",
        inverse: {
          title: "Indexed Content For",
          titlePlural: "Indexed Content Fors",
        },
        description: "Something contained at an index by something",
        properties: [
          {
            propertyType: fractionalIndexPropertyType,
            required: true,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
    },
  );

  const websiteUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Website URL",
        description: "A URL for a website",
        possibleValues: [{ dataTypeId: systemDataTypes.uri.dataTypeId }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const pinnedEntityTypeBaseUrlPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Pinned Entity Type Base URL",
        description: "The base URL of a pinned entity type.",
        possibleValues: [{ dataTypeId: systemDataTypes.uri.dataTypeId }],
      },
      webShortname: "hash",
      migrationState,
    });

  const hasAvatarLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Avatar",
        titlePlural: "Has Avatars",
        inverse: {
          title: "Avatar For",
          titlePlural: "Avatar Fors",
        },
        description: "The avatar something has.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const hasCoverImageLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Cover Image",
        titlePlural: "Has Cover Images",
        inverse: {
          title: "Cover Image For",
          titlePlural: "Cover Image Fors",
        },
        description: "The cover image something has.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const hasBioLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Bio",
        titlePlural: "Has Bios",
        inverse: {
          title: "Bio For",
          titlePlural: "Bio Fors",
        },
        description: "The biography something has.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
            propertyType: descriptionPropertyTypeUrl,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
        possibleValues: [{ dataTypeId: systemDataTypes.uri.dataTypeId }],
      },
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
    webShortname: "hash",
    migrationState,
    instantiator: anyUserInstantiator,
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
    webShortname: "hash",
    migrationState,
    instantiator: anyUserInstantiator,
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
    webShortname: "hash",
    migrationState,
    instantiator: anyUserInstantiator,
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
    webShortname: "hash",
    migrationState,
    instantiator: anyUserInstantiator,
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
    webShortname: "hash",
    migrationState,
    instantiator: anyUserInstantiator,
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
    webShortname: "hash",
    migrationState,
    instantiator: anyUserInstantiator,
  });

  /** User entity type */

  const emailPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Email",
        description: "An email address",
        possibleValues: [{ dataTypeId: systemDataTypes.email.dataTypeId }],
      },
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
    });

  const isMemberOfLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Is Member Of",
        titlePlural: "Is Member Ofs",
        inverse: {
          title: "Has Member",
          titlePlural: "Has Members",
        },
        description: "Something that someone or something is a member of.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const hasServiceAccountLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Service Account",
        titlePlural: "Has Service Accounts",
        inverse: {
          title: "Service Account For",
          titlePlural: "Service Account Fors",
        },
        description: "The service account something has.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
        labelProperty: systemPropertyTypes.preferredName.propertyTypeBaseUrl,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
    },
  );

  const hasParentLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Parent",
        titlePlural: "Has Parents",
        inverse: {
          title: "Parent Of",
          titlePlural: "Parent Ofs",
        },
        description: "The parent something has.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
    },
  );

  const hasSpatiallyPositionedContentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Spatially Positioned Content",
        titlePlural: "Has Spatially Positioned Contents",
        inverse: {
          title: "Spatially Positioned Content For",
          titlePlural: "Spatially Positioned Content Fors",
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const expiredAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Expired At",
        description: "Stringified timestamp of when something expired.",
        possibleValues: [
          { dataTypeId: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
        ],
      },
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
    },
  );

  const syncLinearDataWithLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Sync Linear Data With",
        description: "Something that syncs linear data with something.",
        properties: [
          {
            propertyType: linearTeamIdPropertyType,
            array: true,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  const usesUserSecretLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Uses User Secret",
        titlePlural: "Uses User Secrets",
        inverse: {
          title: "Used By",
          titlePlural: "Used Bys",
        },
        description: "The user secret something uses.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
        possibleValues: [
          { dataTypeId: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
        ],
      },
      webShortname: "hash",
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
        possibleValues: [
          { dataTypeId: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
        ],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const hasTextLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Text",
        titlePlural: "Has Texts",
        inverse: {
          title: "Text For",
          titlePlural: "Text Fors",
        },
        description: "The text something has.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const authoredByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Authored By",
        titlePlural: "Authored By",
        icon: "/icons/types/pen.svg",
        inverse: {
          title: "Author Of",
          titlePlural: "Author Ofs",
        },
        description: "What or whom something was authored by.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
        possibleValues: [
          { dataTypeId: "https://hash.ai/@hash/types/data-type/datetime/v/1" },
        ],
      },
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /** Mention Notification entity type */

  const occurredInEntityLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Occurred In Entity",
        titlePlural: "Occurred In Entitys",
        inverse: {
          title: "Location Of",
          titlePlural: "Location Ofs",
        },
        description: "An entity that something occurred in.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  const occurredInBlockLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Occurred In Block",
        titlePlural: "Occurred In Blocks",
        inverse: {
          title: "Location Of",
          titlePlural: "Location Ofs",
        },
        description: "A block that something occurred in.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const occurredInCommentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Occurred In Comment",
        titlePlural: "Occurred In Comments",
        inverse: {
          title: "Location Of",
          titlePlural: "Location Ofs",
        },
        description: "A comment that something occurred in.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  const occurredInTextLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Occurred In Text",
        titlePlural: "Occurred In Texts",
        inverse: {
          title: "Location Of",
          titlePlural: "Location Ofs",
        },
        description: "Text that something occurred in.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const triggeredByUserLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Triggered By User",
        titlePlural: "Triggered By Users",
        inverse: {
          title: "Triggered",
          titlePlural: "Triggereds",
        },
        description: "A user that triggered something.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  /** Comment Notification entity type */

  const triggeredByCommentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Triggered By Comment",
        titlePlural: "Triggered By Comment",
        inverse: {
          title: "Triggered",
          titlePlural: "Triggereds",
        },
        description: "A comment that triggered something.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  const repliedToCommentLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Replied To Comment",
        titlePlural: "Replied To Comments",
        inverse: {
          title: "Replied To By",
          titlePlural: "Replied To Bys",
        },
        description: "The comment that something replied to.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  return migrationState;
};

export default migrate;
