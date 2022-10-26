import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { types } from "@hashintel/hash-shared/types";
import { logger } from "../logger";

import { EntityTypeModel, LinkTypeModel, PropertyTypeModel } from "../model";
import {
  propertyTypeInitializer,
  entityTypeInitializer,
  linkTypeInitializer,
  workspaceAccountId,
} from "../model/util";

// eslint-disable-next-line import/no-mutable-exports
export let WORKSPACE_TYPES: {
  dataType: {};
  propertyType: {
    // General account related
    shortName: PropertyTypeModel;

    // User-related
    email: PropertyTypeModel;
    kratosIdentityId: PropertyTypeModel;
    preferredName: PropertyTypeModel;

    // Org-related
    orgName: PropertyTypeModel;
    orgSize: PropertyTypeModel;
    orgProvidedInfo: PropertyTypeModel;

    // OrgMembership-related
    responsibility: PropertyTypeModel;

    // Block-related
    componentId: PropertyTypeModel;

    // Page-related
    archived: PropertyTypeModel;
    summary: PropertyTypeModel;
    title: PropertyTypeModel;
    index: PropertyTypeModel;
    icon: PropertyTypeModel;

    // Text-related
    tokens: PropertyTypeModel;

    // Comment-related
    resolvedAt: PropertyTypeModel;
  };
  entityType: {
    user: EntityTypeModel;
    org: EntityTypeModel;
    orgMembership: EntityTypeModel;
    block: EntityTypeModel;
    comment: EntityTypeModel;
    page: EntityTypeModel;
    text: EntityTypeModel;
    /**
     * @todo: deprecate all uses of this dummy entity type
     * @see https://app.asana.com/0/1202805690238892/1203015527055368/f
     */
    dummy: EntityTypeModel;
  };
  linkType: {
    // User-related
    hasMembership: LinkTypeModel;

    // OrgMembership-related
    ofOrg: LinkTypeModel;

    // Block-related
    blockData: LinkTypeModel;

    // Page-related
    contains: LinkTypeModel;
    parent: LinkTypeModel;

    // Comment-related
    hasText: LinkTypeModel;
    author: LinkTypeModel;
  };
};

// Generate the schema for the org provided info property type
export const orgProvidedInfoPropertyTypeInitializer = async (
  graphApi: GraphApi,
) => {
  const orgSizePropertyTypeModel =
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.orgSize(graphApi);

  const orgSizeBaseUri = orgSizePropertyTypeModel.baseUri;

  return propertyTypeInitializer({
    ...types.propertyType.orgProvidedInfo,
    possibleValues: [
      {
        propertyTypeObjectProperties: {
          [orgSizeBaseUri]: {
            $ref: orgSizePropertyTypeModel.schema.$id,
          },
        },
      },
    ],
    actorId: workspaceAccountId,
  })(graphApi);
};

// Generate the schema for the org entity type
export const orgEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const shortnamePropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.shortName(graphApi);

  const orgNamePropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.orgName(graphApi);

  const orgProvidedInfoPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.orgProvidedInfo(graphApi);
  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.org,
    properties: [
      {
        propertyTypeModel: shortnamePropertyTypeModel,
        required: true,
      },
      {
        propertyTypeModel: orgNamePropertyTypeModel,
        required: true,
      },
      {
        propertyTypeModel: orgProvidedInfoPropertyTypeModel,
        required: false,
      },
    ],
    outgoingLinks: [],
    actorId: workspaceAccountId,
  })(graphApi);
};

const orgMembershipEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const responsibilityPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.responsibility(graphApi);

  const orgEntityTypeModel = await WORKSPACE_TYPES_INITIALIZERS.entityType.org(
    graphApi,
  );

  const ofOrgLinkTypeModel = await WORKSPACE_TYPES_INITIALIZERS.linkType.ofOrg(
    graphApi,
  );
  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.orgMembership,
    properties: [
      {
        propertyTypeModel: responsibilityPropertyTypeModel,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkTypeModel: ofOrgLinkTypeModel,
        destinationEntityTypeModels: [orgEntityTypeModel],
        required: true,
      },
    ],
    actorId: workspaceAccountId,
  })(graphApi);
};

const shortnamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.shortName,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const orgNamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.orgName,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const orgSizePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.orgSize,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const emailPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.email,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const kratosIdentityIdPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.kratosIdentityId,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const preferredNamePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.preferredName,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const responsibilityPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.responsibility,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const ofOrgLinkTypeInitializer = linkTypeInitializer({
  ...types.linkType.ofOrg,
  actorId: workspaceAccountId,
});

const hasMembershipLinkTypeInitializer = linkTypeInitializer({
  ...types.linkType.hasMembership,
  actorId: workspaceAccountId,
});

const userEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */
  const shortnamePropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.shortName(graphApi);

  const emailPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.email(graphApi);

  const kratosIdentityIdPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.kratosIdentityId(graphApi);

  const preferredNamePropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.preferredName(graphApi);

  const hasMembershipLinkTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.hasMembership(graphApi);

  const orgMembershipEntityTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.entityType.orgMembership(graphApi);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.user,
    properties: [
      {
        propertyTypeModel: shortnamePropertyTypeModel,
      },
      {
        propertyTypeModel: emailPropertyTypeModel,
        required: true,
        array: { minItems: 1 },
      },
      {
        propertyTypeModel: kratosIdentityIdPropertyTypeModel,
        required: true,
      },
      {
        propertyTypeModel: preferredNamePropertyTypeModel,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkTypeModel: hasMembershipLinkTypeModel,
        destinationEntityTypeModels: [orgMembershipEntityTypeModel],
      },
    ],
    actorId: workspaceAccountId,
  })(graphApi);
};

const componentIdPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.componentId,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const blockDataLinkTypeInitializer = linkTypeInitializer({
  ...types.linkType.blockData,
  actorId: workspaceAccountId,
});

const blockEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const componentIdPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.componentId(graphApi);

  const blockDataLinkTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.blockData(graphApi);

  const dummyEntityTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.entityType.dummy(graphApi);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.block,
    properties: [
      {
        propertyTypeModel: componentIdPropertyTypeModel,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkTypeModel: blockDataLinkTypeModel,
        /**
         * @todo: unset this when the destination entity type can be undefined
         * @see https://app.asana.com/0/1202805690238892/1203015527055368/f
         */
        destinationEntityTypeModels: [dummyEntityTypeModel],
        required: true,
      },
    ],
    actorId: workspaceAccountId,
  })(graphApi);
};

const tokensPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.tokens,
  /**
   * @todo: potentially improve this property type to be composed of nested property type definitions
   * @see https://app.asana.com/0/1202805690238892/1203045933021778/f
   */
  possibleValues: [{ primitiveDataType: "object" }],
  actorId: workspaceAccountId,
});

const textEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const tokensPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.tokens(graphApi);

  /* eslint-enable @typescript-eslint/no-use-before-define */
  return entityTypeInitializer({
    ...types.entityType.text,
    properties: [
      {
        propertyTypeModel: tokensPropertyTypeModel,
        required: true,
        array: true,
      },
    ],
    outgoingLinks: [],
    actorId: workspaceAccountId,
  })(graphApi);
};

/**
 * @todo: remove this dummy entity type once we are able to define the block data link type without it
 * @see https://app.asana.com/0/1202805690238892/1203015527055368/f
 */
const dummyEntityTypeInitializer = async (graphApi: GraphApi) => {
  return entityTypeInitializer({
    ...types.entityType.dummy,
    properties: [],
    outgoingLinks: [],
    actorId: workspaceAccountId,
  })(graphApi);
};

const archivedPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.archived,
  possibleValues: [{ primitiveDataType: "boolean" }],
  actorId: workspaceAccountId,
});

const summaryPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.summary,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const titlePropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.title,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const indexPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.index,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const iconPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.icon,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const containsLinkTypeInitializer = linkTypeInitializer({
  ...types.linkType.contains,
  actorId: workspaceAccountId,
});

const parentLinkTypeInitializer = linkTypeInitializer({
  ...types.linkType.parent,
  actorId: workspaceAccountId,
});

const pageEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const summaryPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.summary(graphApi);

  const archivedPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.archived(graphApi);

  const titlePropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.title(graphApi);

  const indexPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.index(graphApi);

  const iconPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.icon(graphApi);

  const containsLinkTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.contains(graphApi);

  const parentLinkTypeTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.parent(graphApi);

  const blockEntityTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.entityType.block(graphApi);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.page,
    properties: [
      {
        propertyTypeModel: summaryPropertyTypeModel,
      },
      {
        propertyTypeModel: archivedPropertyTypeModel,
      },
      {
        propertyTypeModel: iconPropertyTypeModel,
      },
      {
        propertyTypeModel: titlePropertyTypeModel,
        required: true,
      },
      {
        propertyTypeModel: indexPropertyTypeModel,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkTypeModel: containsLinkTypeModel,
        destinationEntityTypeModels: [blockEntityTypeModel],
        required: true,
        array: true,
        ordered: true,
      },
      {
        linkTypeModel: parentLinkTypeTypeModel,
        destinationEntityTypeModels: ["SELF_REFERENCE"],
      },
    ],
    actorId: workspaceAccountId,
  })(graphApi);
};

const resolvedAtPropertyTypeInitializer = propertyTypeInitializer({
  ...types.propertyType.resolvedAt,
  possibleValues: [{ primitiveDataType: "text" }],
  actorId: workspaceAccountId,
});

const hasTextLinkTypeInitializer = linkTypeInitializer({
  ...types.linkType.hasText,
  actorId: workspaceAccountId,
});

const authorLinkTypeInitializer = linkTypeInitializer({
  ...types.linkType.author,
  actorId: workspaceAccountId,
});

const commentEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const resolvedAtPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.resolvedAt(graphApi);

  const hasTextLinkTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.hasText(graphApi);

  const parentLinkTypeTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.parent(graphApi);

  const authorLinkTypeTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.author(graphApi);

  const userEntityTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.entityType.user(graphApi);

  const textEntityTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.entityType.text(graphApi);

  const blockEntityTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.entityType.block(graphApi);

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    ...types.entityType.comment,
    properties: [
      {
        propertyTypeModel: resolvedAtPropertyTypeModel,
      },
    ],
    outgoingLinks: [
      {
        linkTypeModel: hasTextLinkTypeModel,
        destinationEntityTypeModels: [textEntityTypeModel],
        required: true,
      },
      {
        linkTypeModel: parentLinkTypeTypeModel,
        destinationEntityTypeModels: ["SELF_REFERENCE", blockEntityTypeModel],
        required: true,
      },
      {
        linkTypeModel: authorLinkTypeTypeModel,
        destinationEntityTypeModels: [userEntityTypeModel],
        required: true,
      },
    ],
    actorId: workspaceAccountId,
  })(graphApi);
};

type LazyPromise<T> = (graphApi: GraphApi) => Promise<T>;

type FlattenAndPromisify<T> = {
  [K in keyof T]: T[K] extends object
    ? { [I in keyof T[K]]: LazyPromise<T[K][I]> }
    : never;
};

export const WORKSPACE_TYPES_INITIALIZERS: FlattenAndPromisify<
  typeof WORKSPACE_TYPES
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
  },
  entityType: {
    user: userEntityTypeInitializer,
    org: orgEntityTypeInitializer,
    orgMembership: orgMembershipEntityTypeInitializer,
    block: blockEntityTypeInitializer,
    page: pageEntityTypeInitializer,
    comment: commentEntityTypeInitializer,
    text: textEntityTypeInitializer,
    dummy: dummyEntityTypeInitializer,
  },
  linkType: {
    ofOrg: ofOrgLinkTypeInitializer,
    hasMembership: hasMembershipLinkTypeInitializer,
    blockData: blockDataLinkTypeInitializer,
    contains: containsLinkTypeInitializer,
    parent: parentLinkTypeInitializer,
    hasText: hasTextLinkTypeInitializer,
    author: authorLinkTypeInitializer,
  },
};

/**
 * Ensures the required workspace types have been created in the graph.
 */
export const ensureWorkspaceTypesExist = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi } = params;
  logger.debug("Ensuring Workspace system types exist");

  // Create workspace types if they don't already exist
  /**
   * @todo Use transactional primitive/bulk insert to be able to do this in parallel
   *   see the following task:
   *   https://app.asana.com/0/1201095311341924/1202573572594586/f
   */

  const initializedWorkspaceTypes: any = {};

  // eslint-disable-next-line guard-for-in
  for (const typeKind in WORKSPACE_TYPES_INITIALIZERS) {
    initializedWorkspaceTypes[typeKind] = {};

    const inner =
      WORKSPACE_TYPES_INITIALIZERS[
        typeKind as keyof typeof WORKSPACE_TYPES_INITIALIZERS
      ];
    for (const [key, typeInitializer] of Object.entries(inner)) {
      logger.debug(`Checking Workspace system type: [${key}] exists`);
      const model = await typeInitializer(graphApi);
      initializedWorkspaceTypes[typeKind][key] = model;
    }
  }

  WORKSPACE_TYPES = initializedWorkspaceTypes;
};
