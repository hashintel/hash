import { Logger } from "@local/hash-backend-utils/logger";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  DataTypeWithMetadata,
  descriptionPropertyTypeUrl,
  EntityTypeWithMetadata,
  fileUrlPropertyTypeUrl,
  mimeTypePropertyTypeUrl,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

import { logger } from "../logger";
import { ImpureGraphContext } from "./context-types";
import { entityTypeInitializer, propertyTypeInitializer } from "./util";

/**
 * IF YOU EDIT THIS FILE in a way which affects the number or structure of system types,
 * run `yarn generate-system-types` to update their TypeScript representation
 *
 * @todo enforce this in CI – H-308
 */

// eslint-disable-next-line import/no-mutable-exports
export let SYSTEM_TYPES: {
  dataType: {};
  propertyType: {
    // General
    location: PropertyTypeWithMetadata;
    // @todo use 'url' when this is available? or rename to websiteUrl?
    website: PropertyTypeWithMetadata;

    // General account related
    shortname: PropertyTypeWithMetadata;
    pinnedEntityTypeBaseUrl: PropertyTypeWithMetadata;

    // User-related
    email: PropertyTypeWithMetadata;
    kratosIdentityId: PropertyTypeWithMetadata;
    preferredName: PropertyTypeWithMetadata;
    preferredPronouns: PropertyTypeWithMetadata;

    // Org-related
    orgName: PropertyTypeWithMetadata;
    orgSize: PropertyTypeWithMetadata;
    orgProvidedInfo: PropertyTypeWithMetadata;

    // Block-related
    componentId: PropertyTypeWithMetadata;

    // Page-related
    archived: PropertyTypeWithMetadata;
    summary: PropertyTypeWithMetadata;
    title: PropertyTypeWithMetadata;
    fractionalIndex: PropertyTypeWithMetadata;
    icon: PropertyTypeWithMetadata;

    // Contains related
    numericIndex: PropertyTypeWithMetadata;

    // Timestamps
    resolvedAt: PropertyTypeWithMetadata;
    deletedAt: PropertyTypeWithMetadata;
    expiredAt: PropertyTypeWithMetadata;

    // File storage related
    fileStorageBucket: PropertyTypeWithMetadata;
    fileStorageEndpoint: PropertyTypeWithMetadata;
    fileStorageForcePathStyle: PropertyTypeWithMetadata;
    fileStorageKey: PropertyTypeWithMetadata;
    fileStorageProvider: PropertyTypeWithMetadata;
    fileStorageRegion: PropertyTypeWithMetadata;

    // Integration related
    connectionSourceName: PropertyTypeWithMetadata;

    // Secret storage related
    vaultPath: PropertyTypeWithMetadata;

    // HASH Instance related
    pagesAreEnabled: PropertyTypeWithMetadata;
    userSelfRegistrationIsEnabled: PropertyTypeWithMetadata;
    userRegistrationByInviteIsEnabled: PropertyTypeWithMetadata;
    orgSelfRegistrationIsEnabled: PropertyTypeWithMetadata;

    // Linear Integration related
    linearOrgId: PropertyTypeWithMetadata;

    // Sync With Linear related
    linearTeamId: PropertyTypeWithMetadata;

    // Service Account related
    profileUrl: PropertyTypeWithMetadata;
  };
  entityType: {
    hashInstance: EntityTypeWithMetadata;
    user: EntityTypeWithMetadata;
    file: EntityTypeWithMetadata;
    imageFile: EntityTypeWithMetadata;
    org: EntityTypeWithMetadata;
    block: EntityTypeWithMetadata;
    blockCollection: EntityTypeWithMetadata;
    profileBio: EntityTypeWithMetadata;
    comment: EntityTypeWithMetadata;
    page: EntityTypeWithMetadata;
    quickNote: EntityTypeWithMetadata;
    text: EntityTypeWithMetadata;
    userSecret: EntityTypeWithMetadata;
    linearIntegration: EntityTypeWithMetadata;
    serviceAccount: EntityTypeWithMetadata;
    linkedInAccount: EntityTypeWithMetadata;
    twitterAccount: EntityTypeWithMetadata;
    tikTokAccount: EntityTypeWithMetadata;
    facebookAccount: EntityTypeWithMetadata;
    instagramAccount: EntityTypeWithMetadata;
    gitHubAccount: EntityTypeWithMetadata;
    notification: EntityTypeWithMetadata;
    mentionNotification: EntityTypeWithMetadata;
    commentNotification: EntityTypeWithMetadata;
  };
  linkEntityType: {
    // User-related
    orgMembership: EntityTypeWithMetadata;
    hasServiceAccount: EntityTypeWithMetadata;

    // Account-related
    hasAvatar: EntityTypeWithMetadata;
    hasCoverImage: EntityTypeWithMetadata;
    hasBio: EntityTypeWithMetadata;

    // Block-related
    blockData: EntityTypeWithMetadata;

    // Block Collection related
    contains: EntityTypeWithMetadata;

    // Page-related
    parent: EntityTypeWithMetadata;

    // Comment-related
    hasText: EntityTypeWithMetadata;
    author: EntityTypeWithMetadata;

    // Linear Integration related
    syncLinearDataWith: EntityTypeWithMetadata;
    usesUserSecret: EntityTypeWithMetadata;

    // Mention Notification related
    occurredInEntity: EntityTypeWithMetadata;
    occurredInComment: EntityTypeWithMetadata;
    occurredInText: EntityTypeWithMetadata;
    triggeredByUser: EntityTypeWithMetadata;

    // Comment Notification related
    triggeredByComment: EntityTypeWithMetadata;
    repliedToComment: EntityTypeWithMetadata;
  };
};

const pagesAreEnabledPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.pagesAreEnabled,
  possibleValues: [{ primitiveDataType: "boolean" }],
  webShortname: "hash",
});

const userSelfRegistrationIsEnabledPropertyTypeInitializer =
  propertyTypeInitializer({
    ...systemTypes.propertyType.userSelfRegistrationIsEnabled,
    possibleValues: [{ primitiveDataType: "boolean" }],
    webShortname: "hash",
  });

const orgSelfRegistrationIsEnabledPropertyTypeInitializer =
  propertyTypeInitializer({
    ...systemTypes.propertyType.orgSelfRegistrationIsEnabled,
    possibleValues: [{ primitiveDataType: "boolean" }],
    webShortname: "hash",
  });

const userRegistrationByInviteIsEnabledPropertyTypeInitializer =
  propertyTypeInitializer({
    ...systemTypes.propertyType.userRegistrationByInviteIsEnabled,
    possibleValues: [{ primitiveDataType: "boolean" }],
    webShortname: "hash",
  });

export const hashInstanceEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const pagesAreEnabledPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.pagesAreEnabled(context);

  const userSelfRegistrationIsEnabledPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.userSelfRegistrationIsEnabled(
      context,
    );

  const orgSelfRegistrationIsEnabledPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgSelfRegistrationIsEnabled(
      context,
    );

  const userRegistrationByInviteIsEnabledPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.userRegistrationByInviteIsEnabled(
      context,
    );

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.hashInstance,
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
    webShortname: "hash",
  })(context);
};

// Generate the schema for the org provided info property type
export const orgProvidedInfoPropertyTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  const orgSizePropertyType =
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgSize(context);

  const orgSizeBaseUrl = orgSizePropertyType.metadata.recordId.baseUrl;

  return propertyTypeInitializer({
    ...systemTypes.propertyType.orgProvidedInfo,
    possibleValues: [
      {
        propertyTypeObjectProperties: {
          [orgSizeBaseUrl]: {
            $ref: orgSizePropertyType.schema.$id,
          },
        },
      },
    ],
    webShortname: "hash",
  })(context);
};

const hasBioLinkEntityTypeInitializer = async (context: ImpureGraphContext) =>
  entityTypeInitializer({
    ...systemTypes.linkEntityType.hasBio,
    webShortname: "hash",
  })(context);

// Generate the schema for the org entity type
export const orgEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const shortnamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.shortname(context);

  const locationPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.location(context);

  const orgNamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgName(context);

  const orgProvidedInfoPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgProvidedInfo(context);

  const websitePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.website(context);

  const pinnedEntityTypeBaseUrlPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.pinnedEntityTypeBaseUrl(
      context,
    );

  const hasAvatarLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.hasAvatar(context);

  const hasCoverImageLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.hasCoverImage(context);

  const imageFileEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.imageFile(context);

  const hasBioLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.hasBio(context);

  const profileBioEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.profileBio(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.org,
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
        propertyType: orgProvidedInfoPropertyType,
        required: false,
      },
      {
        propertyType: websitePropertyType,
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
    webShortname: "hash",
  })(context);
};

const locationPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.location,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const websitePropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.website,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const shortnamePropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.shortname,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const orgNamePropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.orgName,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const orgSizePropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.orgSize,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const emailPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.email,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const kratosIdentityIdPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.kratosIdentityId,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const preferredNamePropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.preferredName,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const preferredPronounsPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.preferredPronouns,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const pinnedEntityTypeBaseUrlPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.pinnedEntityTypeBaseUrl,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const orgMembershipLinkEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  return entityTypeInitializer({
    ...systemTypes.linkEntityType.orgMembership,
    webShortname: "hash",
  })(context);
};

const userEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const shortnamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.shortname(context);

  const emailPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.email(context);

  const kratosIdentityIdPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.kratosIdentityId(context);

  const preferredNamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.preferredName(context);

  const preferredPronounsPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.preferredPronouns(context);

  const pinnedEntityTypeBaseUrlPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.pinnedEntityTypeBaseUrl(
      context,
    );

  const locationPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.location(context);

  const websitePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.website(context);

  const orgEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.org(context);

  const serviceAccountEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.serviceAccount(context);

  const orgMembershipLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.orgMembership(context);

  const hasAvatarLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.hasAvatar(context);

  const hasServiceAccountLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.hasServiceAccount(context);

  const imageFileEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.imageFile(context);

  const hasBioLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.hasBio(context);

  const profileBioEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.profileBio(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.user,
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
        propertyType: websitePropertyType,
      },
      {
        propertyType: pinnedEntityTypeBaseUrlPropertyType,
        array: { maxItems: 5 },
      },
    ],
    outgoingLinks: [
      {
        linkEntityType: orgMembershipLinkEntityType,
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
    webShortname: "hash",
  })(context);
};

const profileUrlPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.profileUrl,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const serviceAccountEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const profileUrlPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.profileUrl(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.serviceAccount,
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
    webShortname: "hash",
  })(context);
};

const linkedInAccountEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const serviceAccountEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.serviceAccount(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.linkedInAccount,
    allOf: [serviceAccountEntityType.schema.$id],
    webShortname: "hash",
  })(context);
};

const twitterAccountEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const serviceAccountEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.serviceAccount(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.twitterAccount,
    allOf: [serviceAccountEntityType.schema.$id],
    webShortname: "hash",
  })(context);
};

const tikTokAccountEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const serviceAccountEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.serviceAccount(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.tikTokAccount,
    allOf: [serviceAccountEntityType.schema.$id],
    webShortname: "hash",
  })(context);
};

const facebookAccountEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const serviceAccountEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.serviceAccount(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.facebookAccount,
    allOf: [serviceAccountEntityType.schema.$id],
    webShortname: "hash",
  })(context);
};

const instagramAccountEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const serviceAccountEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.serviceAccount(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.instagramAccount,
    allOf: [serviceAccountEntityType.schema.$id],
    webShortname: "hash",
  })(context);
};

const gitHubAccountEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const serviceAccountEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.serviceAccount(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.gitHubAccount,
    allOf: [serviceAccountEntityType.schema.$id],
    webShortname: "hash",
  })(context);
};

const componentIdPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.componentId,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const blockDataLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.blockData,
  webShortname: "hash",
});

const blockEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const componentIdPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.componentId(context);

  const blockDataLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.blockData(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.block,
    properties: [
      {
        propertyType: componentIdPropertyType,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkEntityType: blockDataLinkEntityType,
        minItems: 1,
        maxItems: 1,
      },
    ],
    webShortname: "hash",
  })(context);
};

const textEntityTypeInitializer = async (context: ImpureGraphContext) =>
  entityTypeInitializer({
    ...systemTypes.entityType.text,
    properties: [
      {
        propertyType:
          "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2",
        required: true,
      },
    ],
    webShortname: "hash",
  })(context);

const fileStorageBucketPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.fileStorageBucket,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const fileStorageEndpointPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.fileStorageEndpoint,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const fileStorageForcePathStylePropertyTypeInitializer =
  propertyTypeInitializer({
    ...systemTypes.propertyType.fileStorageForcePathStyle,
    possibleValues: [{ primitiveDataType: "boolean" }],
    webShortname: "hash",
  });

const fileStorageKeyPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.fileStorageKey,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const fileStorageProviderPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.fileStorageProvider,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const fileStorageRegionPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.fileStorageRegion,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const fileEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const fileStorageBucketPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileStorageBucket(context);

  const fileStorageEndpointPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileStorageEndpoint(context);

  const fileStorageForcePathStylePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileStorageForcePathStyle(
      context,
    );

  const fileStorageKeyPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileStorageKey(context);

  const fileStorageProviderPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileStorageProvider(context);

  const fileStorageProviderRegion =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileStorageRegion(context);
  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.file,
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
        propertyType: fileStorageProviderRegion,
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
    webShortname: "hash",
  })(context);
};

const imageFileEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const fileEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.file(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.imageFile,
    allOf: [fileEntityType.schema.$id],
    webShortname: "hash",
  })(context);
};

const archivedPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.archived,
  possibleValues: [{ primitiveDataType: "boolean" }],
  webShortname: "hash",
});

const summaryPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.summary,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const titlePropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.title,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const fractionalIndexPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.fractionalIndex,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const iconPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.icon,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const numericIndexPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.numericIndex,
  possibleValues: [{ primitiveDataType: "number" }],
  webShortname: "hash",
});

/**
 * @todo this 'contains' link type is used to link a page to blocks it contains
 *     for both canvas and document mode. We probably want to split these out into two links,
 *     and maybe even split a Page into two types. @see https://app.asana.com/0/1204355839255041/1204504514595841/f
 */
const containsLinkEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const numericIndexPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.numericIndex(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.linkEntityType.contains,
    properties: [
      {
        propertyType: numericIndexPropertyType,
      },
    ],
    webShortname: "hash",
  })(context);
};

const blockCollectionEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const containsLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.contains(context);

  const blockEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.block(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.blockCollection,
    outgoingLinks: [
      {
        linkEntityType: containsLinkEntityType,
        destinationEntityTypes: [blockEntityType],
        minItems: 1,
        ordered: true,
      },
    ],
    webShortname: "hash",
  })(context);
};

const quickNoteEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const blockCollectionEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.blockCollection(context);

  const archivedPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.archived(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.quickNote,
    allOf: [blockCollectionEntityType.schema.$id],
    properties: [{ propertyType: archivedPropertyType }],
    webShortname: "hash",
  })(context);
};

const parentLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.parent,
  webShortname: "hash",
});

const pageEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const summaryPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.summary(context);

  const archivedPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.archived(context);

  const titlePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.title(context);

  const fractionalIndexPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fractionalIndex(context);

  const iconPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.icon(context);

  const parentLinkTypeType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.parent(context);

  const blockCollectionEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.blockCollection(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.page,
    allOf: [blockCollectionEntityType.schema.$id],
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
        linkEntityType: parentLinkTypeType,
        destinationEntityTypes: ["SELF_REFERENCE"],
        maxItems: 1,
      },
    ],
    webShortname: "hash",
  })(context);
};

const profileBioEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const blockCollectionEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.blockCollection(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.profileBio,
    allOf: [blockCollectionEntityType.schema.$id],
    webShortname: "hash",
  })(context);
};

const resolvedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.resolvedAt,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const deletedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.deletedAt,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const expiredAtPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.expiredAt,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const connectionSourceNamePropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.connectionSourceName,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const vaultPathPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.vaultPath,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const linearTeamIdPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.linearTeamId,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const syncLinearDataWithLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.syncLinearDataWith,
  properties: [
    {
      propertyType: systemTypes.propertyType.linearTeamId.propertyTypeId,
      array: true,
    },
  ],
  webShortname: "hash",
});

const usesUserSecretLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.usesUserSecret,
  webShortname: "hash",
});

const hasServiceAccountSecretLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.hasServiceAccount,
  webShortname: "hash",
});

const userSecretEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.entityType.userSecret,
  properties: [
    {
      propertyType: systemTypes.propertyType.expiredAt.propertyTypeId,
      required: true,
    },
    {
      propertyType:
        systemTypes.propertyType.connectionSourceName.propertyTypeId,
      required: true,
    },
    {
      propertyType: systemTypes.propertyType.vaultPath.propertyTypeId,
      required: true,
    },
  ],
  webShortname: "hash",
});

const linearOrgIdPropertyTypeInitializer = propertyTypeInitializer({
  ...systemTypes.propertyType.linearOrgId,
  possibleValues: [{ primitiveDataType: "text" }],
  webShortname: "hash",
});

const linearIntegrationEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.entityType.linearIntegration,
  properties: [
    {
      propertyType: systemTypes.propertyType.linearOrgId.propertyTypeId,
      required: true,
    },
  ],
  outgoingLinks: [
    {
      linkEntityType:
        systemTypes.linkEntityType.syncLinearDataWith.linkEntityTypeId,
      destinationEntityTypes: [
        systemTypes.entityType.user.entityTypeId,
        systemTypes.entityType.org.entityTypeId,
      ],
    },
    {
      linkEntityType:
        systemTypes.linkEntityType.usesUserSecret.linkEntityTypeId,
      destinationEntityTypes: [systemTypes.entityType.userSecret.entityTypeId],
      minItems: 1,
      maxItems: 1,
    },
  ],
  webShortname: "hash",
});

const hasAvatarLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.hasAvatar,
  webShortname: "hash",
});

const hasCoverImageLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.hasCoverImage,
  webShortname: "hash",
});

const hasTextLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.hasText,
  webShortname: "hash",
});

const authorLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.author,
  webShortname: "hash",
});

const commentEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const resolvedAtPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.resolvedAt(context);

  const deletedAtPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.deletedAt(context);

  const hasTextLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.hasText(context);

  const parentLinkTypeType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.parent(context);

  const authorLinkTypeType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.author(context);

  const userEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.user(context);

  const textEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.text(context);

  const blockEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.block(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.comment,
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
        linkEntityType: parentLinkTypeType,
        destinationEntityTypes: ["SELF_REFERENCE", blockEntityType],
        minItems: 1,
        maxItems: 1,
      },
      {
        linkEntityType: authorLinkTypeType,
        destinationEntityTypes: [userEntityType],
        minItems: 1,
        maxItems: 1,
      },
    ],
    webShortname: "hash",
  })(context);
};

const notificationEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const archivedPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.archived(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.notification,
    properties: [
      {
        propertyType: archivedPropertyType,
      },
    ],
    webShortname: "hash",
  })(context);
};

export const occurredInEntityLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.occurredInEntity,
  webShortname: "hash",
});

export const occurredInCommentLinkEntityTypeInitializer = entityTypeInitializer(
  {
    ...systemTypes.linkEntityType.occurredInComment,
    webShortname: "hash",
  },
);

export const occurredInTextLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.occurredInText,
  webShortname: "hash",
});

export const triggeredByUserLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.triggeredByUser,
  webShortname: "hash",
});

const mentionNotificationEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const notificationEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.notification(context);

  const occurredInEntityLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.occurredInEntity(context);

  const pageEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.page(context);

  const occurredInCommentLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.occurredInComment(context);

  const commentEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.comment(context);

  const occurredInTextLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.occurredInText(context);

  const textEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.text(context);

  const triggeredByUserLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.triggeredByUser(context);

  const userEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.user(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.mentionNotification,
    allOf: [notificationEntityType.schema.$id],
    outgoingLinks: [
      {
        linkEntityType: occurredInEntityLinkEntityType,
        destinationEntityTypes: [pageEntityType],
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
    webShortname: "hash",
  })(context);
};

export const triggeredByCommentLinkEntityTypeInitializer =
  entityTypeInitializer({
    ...systemTypes.linkEntityType.triggeredByComment,
    webShortname: "hash",
  });

export const repliedToCommentLinkEntityTypeInitializer = entityTypeInitializer({
  ...systemTypes.linkEntityType.repliedToComment,
  webShortname: "hash",
});

const commentNotificationEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const notificationEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.notification(context);

  const occurredInEntityLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.occurredInEntity(context);

  const pageEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.page(context);

  const triggeredByCommentLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.triggeredByUser(context);

  const commentEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.comment(context);

  const triggeredByUserLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.triggeredByUser(context);

  const userEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.user(context);

  const repliedToCommentLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.repliedToComment(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...systemTypes.entityType.commentNotification,
    allOf: [notificationEntityType.schema.$id],
    outgoingLinks: [
      {
        linkEntityType: occurredInEntityLinkEntityType,
        destinationEntityTypes: [pageEntityType],
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
    webShortname: "hash",
  })(context);
};

type LazyPromise<T> = (context: ImpureGraphContext) => Promise<T>;

type FlattenAndPromisify<T> = {
  [K in keyof T]: T[K] extends object
    ? { [I in keyof T[K]]: LazyPromise<T[K][I]> }
    : never;
};

export const SYSTEM_TYPES_INITIALIZERS: FlattenAndPromisify<
  typeof SYSTEM_TYPES
> = {
  dataType: {},
  propertyType: {
    location: locationPropertyTypeInitializer,
    website: websitePropertyTypeInitializer,

    shortname: shortnamePropertyTypeInitializer,
    pinnedEntityTypeBaseUrl: pinnedEntityTypeBaseUrlPropertyTypeInitializer,

    email: emailPropertyTypeInitializer,
    kratosIdentityId: kratosIdentityIdPropertyTypeInitializer,
    preferredName: preferredNamePropertyTypeInitializer,
    preferredPronouns: preferredPronounsPropertyTypeInitializer,

    fileStorageBucket: fileStorageBucketPropertyTypeInitializer,
    fileStorageEndpoint: fileStorageEndpointPropertyTypeInitializer,
    fileStorageForcePathStyle: fileStorageForcePathStylePropertyTypeInitializer,
    fileStorageKey: fileStorageKeyPropertyTypeInitializer,
    fileStorageProvider: fileStorageProviderPropertyTypeInitializer,
    fileStorageRegion: fileStorageRegionPropertyTypeInitializer,

    orgName: orgNamePropertyTypeInitializer,
    orgSize: orgSizePropertyTypeInitializer,
    orgProvidedInfo: orgProvidedInfoPropertyTypeInitializer,

    componentId: componentIdPropertyTypeInitializer,

    summary: summaryPropertyTypeInitializer,
    archived: archivedPropertyTypeInitializer,
    title: titlePropertyTypeInitializer,
    fractionalIndex: fractionalIndexPropertyTypeInitializer,
    icon: iconPropertyTypeInitializer,

    numericIndex: numericIndexPropertyTypeInitializer,

    resolvedAt: resolvedAtPropertyTypeInitializer,
    deletedAt: deletedAtPropertyTypeInitializer,
    expiredAt: expiredAtPropertyTypeInitializer,

    connectionSourceName: connectionSourceNamePropertyTypeInitializer,
    vaultPath: vaultPathPropertyTypeInitializer,
    linearOrgId: linearOrgIdPropertyTypeInitializer,
    linearTeamId: linearTeamIdPropertyTypeInitializer,

    pagesAreEnabled: pagesAreEnabledPropertyTypeInitializer,
    userSelfRegistrationIsEnabled:
      userSelfRegistrationIsEnabledPropertyTypeInitializer,
    orgSelfRegistrationIsEnabled:
      orgSelfRegistrationIsEnabledPropertyTypeInitializer,
    userRegistrationByInviteIsEnabled:
      userRegistrationByInviteIsEnabledPropertyTypeInitializer,

    profileUrl: profileUrlPropertyTypeInitializer,
  },
  linkEntityType: {
    orgMembership: orgMembershipLinkEntityTypeInitializer,
    blockData: blockDataLinkEntityTypeInitializer,
    contains: containsLinkEntityTypeInitializer,
    parent: parentLinkEntityTypeInitializer,
    hasAvatar: hasAvatarLinkEntityTypeInitializer,
    hasCoverImage: hasCoverImageLinkEntityTypeInitializer,
    hasText: hasTextLinkEntityTypeInitializer,
    author: authorLinkEntityTypeInitializer,
    syncLinearDataWith: syncLinearDataWithLinkEntityTypeInitializer,
    usesUserSecret: usesUserSecretLinkEntityTypeInitializer,
    hasServiceAccount: hasServiceAccountSecretLinkEntityTypeInitializer,
    hasBio: hasBioLinkEntityTypeInitializer,
    occurredInEntity: occurredInEntityLinkEntityTypeInitializer,
    occurredInComment: occurredInCommentLinkEntityTypeInitializer,
    occurredInText: occurredInTextLinkEntityTypeInitializer,
    triggeredByUser: triggeredByUserLinkEntityTypeInitializer,
    triggeredByComment: triggeredByCommentLinkEntityTypeInitializer,
    repliedToComment: repliedToCommentLinkEntityTypeInitializer,
  },
  entityType: {
    hashInstance: hashInstanceEntityTypeInitializer,
    user: userEntityTypeInitializer,
    org: orgEntityTypeInitializer,
    file: fileEntityTypeInitializer,
    imageFile: imageFileEntityTypeInitializer,
    block: blockEntityTypeInitializer,
    blockCollection: blockCollectionEntityTypeInitializer,
    profileBio: profileBioEntityTypeInitializer,
    page: pageEntityTypeInitializer,
    quickNote: quickNoteEntityTypeInitializer,
    comment: commentEntityTypeInitializer,
    text: textEntityTypeInitializer,
    userSecret: userSecretEntityTypeInitializer,
    linearIntegration: linearIntegrationEntityTypeInitializer,
    serviceAccount: serviceAccountEntityTypeInitializer,
    linkedInAccount: linkedInAccountEntityTypeInitializer,
    twitterAccount: twitterAccountEntityTypeInitializer,
    tikTokAccount: tikTokAccountEntityTypeInitializer,
    facebookAccount: facebookAccountEntityTypeInitializer,
    instagramAccount: instagramAccountEntityTypeInitializer,
    gitHubAccount: gitHubAccountEntityTypeInitializer,
    notification: notificationEntityTypeInitializer,
    mentionNotification: mentionNotificationEntityTypeInitializer,
    commentNotification: commentNotificationEntityTypeInitializer,
  },
};

/**
 * Ensures the required system types have been created in the graph by fetching
 * them or creating them using the `systemAccountId`. Note this method must
 * be run after the `systemAccountId` has been initialized.
 */
export const ensureSystemTypesExist = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { context } = params;
  logger.debug("Ensuring system types exist");

  // Create system types if they don't already exist
  /**
   * @todo Use transactional primitive/bulk insert to be able to do this in parallel
   *   see the following task:
   *   https://app.asana.com/0/1201095311341924/1202573572594586/f
   */

  const initializedSystemTypes: any = {};

  // eslint-disable-next-line guard-for-in
  for (const typeKind in SYSTEM_TYPES_INITIALIZERS) {
    initializedSystemTypes[typeKind] = {};
    const inner =
      SYSTEM_TYPES_INITIALIZERS[
        typeKind as keyof typeof SYSTEM_TYPES_INITIALIZERS
      ];
    for (const [key, typeInitializer] of Object.entries(inner) as [
      string,
      (
        context: ImpureGraphContext,
      ) => Promise<
        PropertyTypeWithMetadata | DataTypeWithMetadata | EntityTypeWithMetadata
      >,
    ][]) {
      logger.debug(`Checking system type: [${key}] exists`);
      initializedSystemTypes[typeKind][key] = await typeInitializer(context);
    }
  }

  SYSTEM_TYPES = initializedSystemTypes;
};
