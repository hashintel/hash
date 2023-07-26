import { Logger } from "@local/hash-backend-utils/logger";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

import { logger } from "../logger";
import { ImpureGraphContext } from "./index";
import { entityTypeInitializer, propertyTypeInitializer } from "./util";

// eslint-disable-next-line import/no-mutable-exports
export let SYSTEM_TYPES: {
  dataType: {};
  propertyType: {
    // General
    description: PropertyTypeWithMetadata;
    location: PropertyTypeWithMetadata;
    // @todo use 'url' when this is available? or rename to websiteUrl?
    website: PropertyTypeWithMetadata;

    // General account related
    shortname: PropertyTypeWithMetadata;

    // User-related
    email: PropertyTypeWithMetadata;
    kratosIdentityId: PropertyTypeWithMetadata;
    preferredName: PropertyTypeWithMetadata;

    // Org-related
    orgName: PropertyTypeWithMetadata;
    orgSize: PropertyTypeWithMetadata;
    orgProvidedInfo: PropertyTypeWithMetadata;

    // OrgMembership-related
    responsibility: PropertyTypeWithMetadata;

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

    // Integration related
    connectionSourceName: PropertyTypeWithMetadata;

    // Secret storage related
    vaultPath: PropertyTypeWithMetadata;
    linearOrgId: PropertyTypeWithMetadata;

    // HASH Instance related
    userSelfRegistrationIsEnabled: PropertyTypeWithMetadata;
    userRegistrationByInviteIsEnabled: PropertyTypeWithMetadata;
    orgSelfRegistrationIsEnabled: PropertyTypeWithMetadata;

    // File related
    fileUrl: PropertyTypeWithMetadata;
    fileMediaType: PropertyTypeWithMetadata;
    externalFileUrl: PropertyTypeWithMetadata;
    objectStoreKey: PropertyTypeWithMetadata;
    fileKey: PropertyTypeWithMetadata;
  };
  entityType: {
    hashInstance: EntityTypeWithMetadata;
    user: EntityTypeWithMetadata;
    org: EntityTypeWithMetadata;
    block: EntityTypeWithMetadata;
    comment: EntityTypeWithMetadata;
    page: EntityTypeWithMetadata;
    text: EntityTypeWithMetadata;
    file: EntityTypeWithMetadata;
    linearUserSecret: EntityTypeWithMetadata;
  };
  linkEntityType: {
    // HASHInstance-related
    admin: EntityTypeWithMetadata;

    // User-related
    orgMembership: EntityTypeWithMetadata;

    // Block-related
    blockData: EntityTypeWithMetadata;

    // Page-related
    contains: EntityTypeWithMetadata;
    parent: EntityTypeWithMetadata;

    // Comment-related
    hasText: EntityTypeWithMetadata;
    author: EntityTypeWithMetadata;

    authorizesDataFrom: EntityTypeWithMetadata;
  };
};

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

export const authorizesDataFromLinkEntityTypeInitializer =
  entityTypeInitializer(types.linkEntityType.authorizesDataFrom);

export const hashInstanceEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

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

  const userEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.user(
    context,
  );

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.hashInstance,
    properties: [
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

// Generate the schema for the org entity type
export const orgEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const shortnamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.shortname(context);

  const descriptionPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.description(context);

  const locationPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.location(context);

  const orgNamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgName(context);

  const orgProvidedInfoPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgProvidedInfo(context);

  const websitePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.website(context);
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
        propertyType: descriptionPropertyType,
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
    ],
  })(context);
};

const descriptionPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.description,
  possibleValues: [{ primitiveDataType: "text" }],
});

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

const responsibilityPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.responsibility,
  possibleValues: [{ primitiveDataType: "text" }],
});

const orgMembershipLinkEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const responsibilityPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.responsibility(context);
  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.linkEntityType.orgMembership,
    properties: [
      {
        propertyType: responsibilityPropertyType,
        required: true,
      },
    ],
  })(context);
};

const userEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const shortnamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.shortname(context);

  const emailPropertyType = await SYSTEM_TYPES_INITIALIZERS.propertyType.email(
    context,
  );

  const kratosIdentityIdPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.kratosIdentityId(context);

  const preferredNamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.preferredName(context);

  const orgEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.org(context);

  const orgMembershipLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.orgMembership(context);

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
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkEntityType: orgMembershipLinkEntityType,
        destinationEntityTypes: [orgEntityType],
      },
    ],
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

const parentLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.parent,
);

const pageEntityTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const summaryPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.summary(context);

  const archivedPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.archived(context);

  const titlePropertyType = await SYSTEM_TYPES_INITIALIZERS.propertyType.title(
    context,
  );

  const indexPropertyType = await SYSTEM_TYPES_INITIALIZERS.propertyType.index(
    context,
  );

  const iconPropertyType = await SYSTEM_TYPES_INITIALIZERS.propertyType.icon(
    context,
  );

  const containsLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.contains(context);

  const parentLinkTypeType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.parent(context);

  const blockEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.block(
    context,
  );

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.page,
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
        linkEntityType: containsLinkEntityType,
        destinationEntityTypes: [blockEntityType],
        minItems: 1,
        ordered: true,
      },
      {
        linkEntityType: parentLinkTypeType,
        destinationEntityTypes: ["SELF_REFERENCE"],
        maxItems: 1,
      },
    ],
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

const linearOrgIdPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.linearOrgId,
  possibleValues: [{ primitiveDataType: "text" }],
});

const linearUserSecretEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const expiredAtPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.expiredAt(context);

  const connectionSourceNamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.connectionSourceName(context);

  const vaultPathEntityType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.vaultPath(context);

  const authorizesDataFromLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.authorizesDataFrom(context);

  const linearOrgIdPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.linearOrgId(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.linearUserSecret,
    properties: [
      { propertyType: expiredAtPropertyType },
      { propertyType: connectionSourceNamePropertyType, required: true },
      { propertyType: vaultPathEntityType, required: true },
      { propertyType: linearOrgIdPropertyType, required: true },
    ],
    outgoingLinks: [
      {
        linkEntityType: authorizesDataFromLinkEntityType,
      },
    ],
  })(context);
};

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

  const userEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.user(
    context,
  );

  const textEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.text(
    context,
  );

  const blockEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.block(
    context,
  );

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

const fileUrlTypePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileUrl,
  possibleValues: [{ primitiveDataType: "text" }],
});

const fileMediaTypePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileMediaType,
  possibleValues: [{ primitiveDataType: "text" }],
});

const objectStoreKeyPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.objectStoreKey,
  possibleValues: [{ primitiveDataType: "text" }],
});

const externalFileUrlPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.externalFileUrl,
  possibleValues: [{ primitiveDataType: "text" }],
});

const fileKeyPropertyTypeInitializer = async (context: ImpureGraphContext) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const objectStoreKeyPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.objectStoreKey(context);

  const externalFileUrlPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.externalFileUrl(context);
  /* eslint-enable @typescript-eslint/no-use-before-define */

  const objectStoreKeyBaseUrl =
    objectStoreKeyPropertyType.metadata.recordId.baseUrl;

  const externalFileUrlBaseUrl =
    externalFileUrlPropertyType.metadata.recordId.baseUrl;

  return propertyTypeInitializer({
    ...types.propertyType.fileKey,
    possibleValues: [
      {
        propertyTypeObjectProperties: {
          [objectStoreKeyBaseUrl]: {
            $ref: objectStoreKeyPropertyType.schema.$id,
          },
        },
      },
      {
        propertyTypeObjectProperties: {
          [externalFileUrlBaseUrl]: {
            $ref: externalFileUrlPropertyType.schema.$id,
          },
        },
      },
    ],
  })(context);
};

export const fileEntityTypeInitializer = async (
  context: ImpureGraphContext,
) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const fileUrlPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileUrl(context);

  const fileMediaTypePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileMediaType(context);

  const fileKeyPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileKey(context);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.file,
    properties: [
      {
        propertyType: fileUrlPropertyType,
        required: true,
      },
      {
        propertyType: fileMediaTypePropertyType,
        required: true,
      },
      {
        propertyType: fileKeyPropertyType,
        required: true,
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
    description: descriptionPropertyTypeInitializer,
    location: locationPropertyTypeInitializer,
    website: websitePropertyTypeInitializer,

    shortname: shortnamePropertyTypeInitializer,

    email: emailPropertyTypeInitializer,
    kratosIdentityId: kratosIdentityIdPropertyTypeInitializer,
    preferredName: preferredNamePropertyTypeInitializer,

    orgName: orgNamePropertyTypeInitializer,
    orgSize: orgSizePropertyTypeInitializer,
    orgProvidedInfo: orgProvidedInfoPropertyTypeInitializer,

    responsibility: responsibilityPropertyTypeInitializer,

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

    userSelfRegistrationIsEnabled:
      userSelfRegistrationIsEnabledPropertyTypeInitializer,
    orgSelfRegistrationIsEnabled:
      orgSelfRegistrationIsEnabledPropertyTypeInitializer,
    userRegistrationByInviteIsEnabled:
      userRegistrationByInviteIsEnabledPropertyTypeInitializer,

    fileUrl: fileUrlTypePropertyTypeInitializer,
    fileMediaType: fileMediaTypePropertyTypeInitializer,
    externalFileUrl: externalFileUrlPropertyTypeInitializer,
    objectStoreKey: objectStoreKeyPropertyTypeInitializer,
    fileKey: fileKeyPropertyTypeInitializer,
  },
  entityType: {
    hashInstance: hashInstanceEntityTypeInitializer,
    user: userEntityTypeInitializer,
    org: orgEntityTypeInitializer,
    block: blockEntityTypeInitializer,
    page: pageEntityTypeInitializer,
    comment: commentEntityTypeInitializer,
    text: textEntityTypeInitializer,
    file: fileEntityTypeInitializer,
    linearUserSecret: linearUserSecretEntityTypeInitializer,
  },
  linkEntityType: {
    admin: adminLinkEntityTypeInitializer,
    authorizesDataFrom: authorizesDataFromLinkEntityTypeInitializer,
    orgMembership: orgMembershipLinkEntityTypeInitializer,
    blockData: blockDataLinkEntityTypeInitializer,
    contains: containsLinkEntityTypeInitializer,
    parent: parentLinkEntityTypeInitializer,
    hasText: hasTextLinkEntityTypeInitializer,
    author: authorLinkEntityTypeInitializer,
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
      const type = await typeInitializer(context);
      initializedSystemTypes[typeKind][key] = type;
    }
  }

  SYSTEM_TYPES = initializedSystemTypes;
};
