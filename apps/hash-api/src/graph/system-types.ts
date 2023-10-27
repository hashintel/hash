import { Logger } from "@local/hash-backend-utils/logger";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  DataTypeWithMetadata,
  descriptionPropertyTypeUrl,
  EntityTypeWithMetadata,
  fileUrlPropertyTypeUrl,
  mimeTypePropertyTypeUrl,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

import { logger } from "../logger";
import { ImpureGraphContext } from "./index";
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
    index: PropertyTypeWithMetadata;
    icon: PropertyTypeWithMetadata;

    // Text-related
    tokens: PropertyTypeWithMetadata;

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
  };
  linkEntityType: {
    // HASHInstance-related
    admin: EntityTypeWithMetadata;

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
  };
};

const pagesAreEnabledPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.pagesAreEnabled,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const userSelfRegistrationIsEnabledPropertyTypeInitializer =
  propertyTypeInitializer({
    ...types.propertyType.userSelfRegistrationIsEnabled,
    possibleValues: [{ primitiveDataType: "boolean" }],
  });

const orgSelfRegistrationIsEnabledPropertyTypeInitializer =
  propertyTypeInitializer({
    ...types.propertyType.orgSelfRegistrationIsEnabled,
    possibleValues: [{ primitiveDataType: "boolean" }],
  });

const userRegistrationByInviteIsEnabledPropertyTypeInitializer =
  propertyTypeInitializer({
    ...types.propertyType.userRegistrationByInviteIsEnabled,
    possibleValues: [{ primitiveDataType: "boolean" }],
  });

export const adminLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.admin,
);

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

  const adminLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.admin(context);

  const userEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.user(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.hashInstance,
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
    outgoingLinks: [
      {
        linkEntityType: adminLinkEntityType,
        destinationEntityTypes: [userEntityType],
      },
    ],
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
    ...types.propertyType.orgProvidedInfo,
    possibleValues: [
      {
        propertyTypeObjectProperties: {
          [orgSizeBaseUrl]: {
            $ref: orgSizePropertyType.schema.$id,
          },
        },
      },
    ],
  })(context);
};

const hasBioLinkEntityTypeInitializer = async (context: ImpureGraphContext) =>
  entityTypeInitializer(types.linkEntityType.hasBio)(context);

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
    ...types.entityType.org,
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
  })(context);
};

const locationPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.location,
  possibleValues: [{ primitiveDataType: "text" }],
});

const websitePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.website,
  possibleValues: [{ primitiveDataType: "text" }],
});

const shortnamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.shortname,
  possibleValues: [{ primitiveDataType: "text" }],
});

const orgNamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.orgName,
  possibleValues: [{ primitiveDataType: "text" }],
});

const orgSizePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.orgSize,
  possibleValues: [{ primitiveDataType: "text" }],
});

const emailPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.email,
  possibleValues: [{ primitiveDataType: "text" }],
});

const kratosIdentityIdPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.kratosIdentityId,
  possibleValues: [{ primitiveDataType: "text" }],
});

const preferredNamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.preferredName,
  possibleValues: [{ primitiveDataType: "text" }],
});

const preferredPronounsPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.preferredPronouns,
  possibleValues: [{ primitiveDataType: "text" }],
});

const pinnedEntityTypeBaseUrlPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.pinnedEntityTypeBaseUrl,
  possibleValues: [{ primitiveDataType: "text" }],
});

const orgMembershipLinkEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  return entityTypeInitializer(types.linkEntityType.orgMembership)(context);
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
    ...types.entityType.user,
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
  })(context);
};

const profileUrlPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.profileUrl,
  possibleValues: [{ primitiveDataType: "text" }],
});

const serviceAccountEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const profileUrlPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.profileUrl(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.serviceAccount,
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
    ...types.entityType.linkedInAccount,
    allOf: [serviceAccountEntityType.schema.$id],
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
    ...types.entityType.twitterAccount,
    allOf: [serviceAccountEntityType.schema.$id],
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
    ...types.entityType.tikTokAccount,
    allOf: [serviceAccountEntityType.schema.$id],
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
    ...types.entityType.facebookAccount,
    allOf: [serviceAccountEntityType.schema.$id],
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
    ...types.entityType.instagramAccount,
    allOf: [serviceAccountEntityType.schema.$id],
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
    ...types.entityType.gitHubAccount,
    allOf: [serviceAccountEntityType.schema.$id],
  })(context);
};

const componentIdPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.componentId,
  possibleValues: [{ primitiveDataType: "text" }],
});

const blockDataLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.blockData,
);

const blockEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const componentIdPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.componentId(context);

  const blockDataLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.blockData(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.block,
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
  })(context);
};

const tokensPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.tokens,
  /**
   * @todo: potentially improve this property type to be composed of nested property type definitions
   * @see https://app.asana.com/0/1202805690238892/1203045933021778/f
   */
  possibleValues: [{ primitiveDataType: "object" }],
});

const textEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const tokensPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.tokens(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */
  return entityTypeInitializer({
    ...types.entityType.text,
    properties: [
      {
        propertyType: tokensPropertyType,
        required: true,
        array: true,
      },
    ],
  })(context);
};

const fileStorageBucketPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileStorageBucket,
  possibleValues: [{ primitiveDataType: "text" }],
});

const fileStorageEndpointPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileStorageEndpoint,
  possibleValues: [{ primitiveDataType: "text" }],
});

const fileStorageForcePathStylePropertyTypeInitializer =
  propertyTypeInitializer({
    ...types.propertyType.fileStorageForcePathStyle,
    possibleValues: [{ primitiveDataType: "boolean" }],
  });

const fileStorageKeyPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileStorageKey,
  possibleValues: [{ primitiveDataType: "text" }],
});

const fileStorageProviderPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileStorageProvider,
  possibleValues: [{ primitiveDataType: "text" }],
});

const fileStorageRegionPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileStorageRegion,
  possibleValues: [{ primitiveDataType: "text" }],
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
    ...types.entityType.file,
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
  })(context);
};

const imageFileEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const fileEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.file(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.imageFile,
    allOf: [fileEntityType.schema.$id],
  })(context);
};

const archivedPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.archived,
  possibleValues: [{ primitiveDataType: "boolean" }],
});

const summaryPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.summary,
  possibleValues: [{ primitiveDataType: "text" }],
});

const titlePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.title,
  possibleValues: [{ primitiveDataType: "text" }],
});

const indexPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.index,
  possibleValues: [{ primitiveDataType: "text" }],
});

const iconPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.icon,
  possibleValues: [{ primitiveDataType: "text" }],
});

/**
 * @todo this 'contains' link type is used to link a page to blocks it contains
 *     for both canvas and document mode. We probably want to split these out into two links,
 *     and maybe even split a Page into two types. @see https://app.asana.com/0/1204355839255041/1204504514595841/f
 */
const containsLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.contains,
);

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
    ...types.entityType.blockCollection,
    outgoingLinks: [
      {
        linkEntityType: containsLinkEntityType,
        destinationEntityTypes: [blockEntityType],
        minItems: 1,
        ordered: true,
      },
    ],
  })(context);
};

const parentLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.parent,
);

const pageEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const summaryPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.summary(context);

  const archivedPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.archived(context);

  const titlePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.title(context);

  const indexPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.index(context);

  const iconPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.icon(context);

  const parentLinkTypeType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.parent(context);

  const blockCollectionEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.blockCollection(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.page,
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
        propertyType: indexPropertyType,
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
  })(context);
};

const profileBioEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const blockCollectionEntityType =
    await SYSTEM_TYPES_INITIALIZERS.entityType.blockCollection(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.profileBio,
    allOf: [blockCollectionEntityType.schema.$id],
  })(context);
};

const resolvedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.resolvedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const deletedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.deletedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const expiredAtPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.expiredAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const connectionSourceNamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.connectionSourceName,
  possibleValues: [{ primitiveDataType: "text" }],
});

const vaultPathPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.vaultPath,
  possibleValues: [{ primitiveDataType: "text" }],
});

const linearTeamIdPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.linearTeamId,
  possibleValues: [{ primitiveDataType: "text" }],
});

const syncLinearDataWithLinkEntityTypeInitializer = entityTypeInitializer({
  ...types.linkEntityType.syncLinearDataWith,
  properties: [
    {
      propertyType: types.propertyType.linearTeamId.propertyTypeId,
      array: true,
    },
  ],
});

const usesUserSecretLinkEntityTypeInitializer = entityTypeInitializer({
  ...types.linkEntityType.usesUserSecret,
});

const hasServiceAccountSecretLinkEntityTypeInitializer = entityTypeInitializer({
  ...types.linkEntityType.hasServiceAccount,
});

const userSecretEntityTypeInitializer = entityTypeInitializer({
  ...types.entityType.userSecret,
  properties: [
    {
      propertyType: types.propertyType.expiredAt.propertyTypeId,
      required: true,
    },
    {
      propertyType: types.propertyType.connectionSourceName.propertyTypeId,
      required: true,
    },
    {
      propertyType: types.propertyType.vaultPath.propertyTypeId,
      required: true,
    },
  ],
});

const linearOrgIdPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.linearOrgId,
  possibleValues: [{ primitiveDataType: "text" }],
});

const linearIntegrationEntityTypeInitializer = entityTypeInitializer({
  ...types.entityType.linearIntegration,
  properties: [
    {
      propertyType: types.propertyType.linearOrgId.propertyTypeId,
      required: true,
    },
  ],
  outgoingLinks: [
    {
      linkEntityType: types.linkEntityType.syncLinearDataWith.linkEntityTypeId,
      destinationEntityTypes: [
        types.entityType.user.entityTypeId,
        types.entityType.org.entityTypeId,
      ],
    },
    {
      linkEntityType: types.linkEntityType.usesUserSecret.linkEntityTypeId,
      destinationEntityTypes: [types.entityType.userSecret.entityTypeId],
      minItems: 1,
      maxItems: 1,
    },
  ],
});

const hasAvatarLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.hasAvatar,
);

const hasCoverImageLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.hasCoverImage,
);

const hasTextLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.hasText,
);

const authorLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.author,
);

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
    ...types.entityType.comment,
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
    index: indexPropertyTypeInitializer,
    icon: iconPropertyTypeInitializer,

    tokens: tokensPropertyTypeInitializer,

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
    admin: adminLinkEntityTypeInitializer,
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
  },
};

/**
 * Ensures the required system types have been created in the graph by fetching
 * them or creating them using the `systemUserAccountId`. Note this method must
 * be run after the `systemUserAccountId` has been initialized.
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
