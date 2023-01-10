import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { types } from "@hashintel/hash-shared/ontology-types";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@hashintel/hash-subgraph";

import { logger } from "../logger";
import { entityTypeInitializer, propertyTypeInitializer } from "./util";

// eslint-disable-next-line import/no-mutable-exports
export let SYSTEM_TYPES: {
  dataType: {};
  propertyType: {
    // General account related
    shortName: PropertyTypeWithMetadata;

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

    // Comment-related
    resolvedAt: PropertyTypeWithMetadata;
    deletedAt: PropertyTypeWithMetadata;

    // HASH Instance related
    userSelfRegistrationIsEnabled: PropertyTypeWithMetadata;
    userRegistrationByInviteIsEnabled: PropertyTypeWithMetadata;
    orgSelfRegistrationIsEnabled: PropertyTypeWithMetadata;

    // File related
    fileName: PropertyTypeWithMetadata;
    fileSize: PropertyTypeWithMetadata;
    externalFileLink: PropertyTypeWithMetadata;
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

export const hashInstanceEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const userSelfRegistrationIsEnabledPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.userSelfRegistrationIsEnabled(
      graphApi,
    );

  const orgSelfRegistrationIsEnabledPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgSelfRegistrationIsEnabled(
      graphApi,
    );

  const userRegistrationByInviteIsEnabledPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.userRegistrationByInviteIsEnabled(
      graphApi,
    );

  const adminLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.admin(graphApi);

  const userEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.user(
    graphApi,
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
  })(graphApi);
};

// Generate the schema for the org provided info property type
export const orgProvidedInfoPropertyTypeInitializer = async (
  graphApi: GraphApi,
) => {
  const orgSizePropertyType =
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgSize(graphApi);

  const orgSizeBaseUri = orgSizePropertyType.metadata.editionId.baseId;

  return propertyTypeInitializer({
    ...types.propertyType.orgProvidedInfo,
    possibleValues: [
      {
        propertyTypeObjectProperties: {
          [orgSizeBaseUri]: {
            $ref: orgSizePropertyType.schema.$id,
          },
        },
      },
    ],
  })(graphApi);
};

// Generate the schema for the org entity type
export const orgEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const shortnamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.shortName(graphApi);

  const orgNamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgName(graphApi);

  const orgProvidedInfoPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.orgProvidedInfo(graphApi);
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
        propertyType: orgProvidedInfoPropertyType,
        required: false,
      },
    ],
  })(graphApi);
};

const shortnamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.shortName,
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

const orgMembershipLinkEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const responsibilityPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.responsibility(graphApi);
  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.linkEntityType.orgMembership,
    properties: [
      {
        propertyType: responsibilityPropertyType,
        required: true,
      },
    ],
  })(graphApi);
};

const userEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const shortnamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.shortName(graphApi);

  const emailPropertyType = await SYSTEM_TYPES_INITIALIZERS.propertyType.email(
    graphApi,
  );

  const kratosIdentityIdPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.kratosIdentityId(graphApi);

  const preferredNamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.preferredName(graphApi);

  const orgEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.org(
    graphApi,
  );

  const orgMembershipLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.orgMembership(graphApi);

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
  })(graphApi);
};

const componentIdPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.componentId,
  possibleValues: [{ primitiveDataType: "text" }],
});

const blockDataLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.blockData,
);

const blockEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const componentIdPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.componentId(graphApi);

  const blockDataLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.blockData(graphApi);

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
  })(graphApi);
};

const tokensPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.tokens,
  /**
   * @todo: potentially improve this property type to be composed of nested property type definitions
   * @see https://app.asana.com/0/1202805690238892/1203045933021778/f
   */
  possibleValues: [{ primitiveDataType: "object" }],
});

const textEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const tokensPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.tokens(graphApi);

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
  })(graphApi);
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

const containsLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.contains,
);

const parentLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.parent,
);

const pageEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const summaryPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.summary(graphApi);

  const archivedPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.archived(graphApi);

  const titlePropertyType = await SYSTEM_TYPES_INITIALIZERS.propertyType.title(
    graphApi,
  );

  const indexPropertyType = await SYSTEM_TYPES_INITIALIZERS.propertyType.index(
    graphApi,
  );

  const iconPropertyType = await SYSTEM_TYPES_INITIALIZERS.propertyType.icon(
    graphApi,
  );

  const containsLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.contains(graphApi);

  const parentLinkTypeType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.parent(graphApi);

  const blockEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.block(
    graphApi,
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
  })(graphApi);
};

const resolvedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.resolvedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const deletedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.deletedAt,
  possibleValues: [{ primitiveDataType: "text" }],
});

const hasTextLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.hasText,
);

const authorLinkEntityTypeInitializer = entityTypeInitializer(
  types.linkEntityType.author,
);

const commentEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const resolvedAtPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.resolvedAt(graphApi);

  const deletedAtPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.deletedAt(graphApi);

  const hasTextLinkEntityType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.hasText(graphApi);

  const parentLinkTypeType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.parent(graphApi);

  const authorLinkTypeType =
    await SYSTEM_TYPES_INITIALIZERS.linkEntityType.author(graphApi);

  const userEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.user(
    graphApi,
  );

  const textEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.text(
    graphApi,
  );

  const blockEntityType = await SYSTEM_TYPES_INITIALIZERS.entityType.block(
    graphApi,
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
  })(graphApi);
};

const fileNamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileName,
  possibleValues: [{ primitiveDataType: "text" }],
});

const fileSizePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.fileSize,
  possibleValues: [{ primitiveDataType: "number" }],
});

const objectStoreKeyPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.objectStoreKey,
  possibleValues: [{ primitiveDataType: "text" }],
});

const externalFileLinkPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.externalFileLink,
  possibleValues: [{ primitiveDataType: "text" }],
});

const fileKeyPropertyTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const objectStoreKeyPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.objectStoreKey(graphApi);

  const fileSizePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileSize(graphApi);

  const externalFileLinkPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.externalFileLink(graphApi);
  /* eslint-enable @typescript-eslint/no-use-before-define */

  const objectStoreKeyBaseUri =
    objectStoreKeyPropertyType.metadata.editionId.baseId;

  const fileSizeBaseUri = fileSizePropertyType.metadata.editionId.baseId;

  const externalFileLinkBaseUri =
    externalFileLinkPropertyType.metadata.editionId.baseId;

  return propertyTypeInitializer({
    ...types.propertyType.fileKey,
    possibleValues: [
      {
        propertyTypeObjectProperties: {
          [objectStoreKeyBaseUri]: {
            $ref: objectStoreKeyPropertyType.schema.$id,
          },
          [fileSizeBaseUri]: {
            $ref: fileSizePropertyType.schema.$id,
          },
        },
      },
      {
        propertyTypeObjectProperties: {
          [externalFileLinkBaseUri]: {
            $ref: externalFileLinkPropertyType.schema.$id,
          },
        },
      },
    ],
  })(graphApi);
};

export const fileEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const fileNamePropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileName(graphApi);

  const fileKeyPropertyType =
    await SYSTEM_TYPES_INITIALIZERS.propertyType.fileKey(graphApi);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.file,
    properties: [
      {
        propertyType: fileNamePropertyType,
        required: true,
      },
      {
        propertyType: fileKeyPropertyType,
        required: true,
      },
    ],
  })(graphApi);
};

type LazyPromise<T> = (graphApi: GraphApi) => Promise<T>;

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
    shortName: shortnamePropertyTypeInitializer,

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

    userSelfRegistrationIsEnabled:
      userSelfRegistrationIsEnabledPropertyTypeInitializer,
    orgSelfRegistrationIsEnabled:
      orgSelfRegistrationIsEnabledPropertyTypeInitializer,
    userRegistrationByInviteIsEnabled:
      userRegistrationByInviteIsEnabledPropertyTypeInitializer,

    fileName: fileNamePropertyTypeInitializer,
    fileSize: fileSizePropertyTypeInitializer,
    externalFileLink: externalFileLinkPropertyTypeInitializer,
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
  },
  linkEntityType: {
    admin: adminLinkEntityTypeInitializer,
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
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi } = params;
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
        graphApi: GraphApi,
      ) => Promise<
        PropertyTypeWithMetadata | DataTypeWithMetadata | EntityTypeWithMetadata
      >,
    ][]) {
      logger.debug(`Checking system type: [${key}] exists`);
      const type = await typeInitializer(graphApi);
      initializedSystemTypes[typeKind][key] = type;
    }
  }

  SYSTEM_TYPES = initializedSystemTypes;
};
