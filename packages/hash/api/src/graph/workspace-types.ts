import { Logger } from "@hashintel/hash-backend-utils/logger";
import { WORKSPACE_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";
import { GraphApi } from "@hashintel/hash-graph-client";
import { logger } from "../logger";

import { EntityTypeModel, LinkTypeModel, PropertyTypeModel } from "../model";
import {
  propertyTypeInitializer,
  entityTypeInitializer,
  linkTypeInitializer,
  SELF_REFERENCE_MARKER,
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

    // Text-related
    tokens: PropertyTypeModel;
  };
  entityType: {
    user: EntityTypeModel;
    org: EntityTypeModel;
    orgMembership: EntityTypeModel;
    block: EntityTypeModel;
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
    namespace: WORKSPACE_ACCOUNT_SHORTNAME,
    title: "Organization Provided Info",
    possibleValues: [
      {
        propertyTypeObjectProperties: {
          [orgSizeBaseUri]: {
            $ref: orgSizePropertyTypeModel.schema.$id,
          },
        },
      },
    ],
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
    namespace: WORKSPACE_ACCOUNT_SHORTNAME,
    title: "Organization",
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
    namespace: WORKSPACE_ACCOUNT_SHORTNAME,
    title: "OrgMembership",
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
  })(graphApi);
};

const shortnamePropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Shortname",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const orgNamePropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Organization Name",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const orgSizePropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Organization Size",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const emailPropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Email",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const kratosIdentityIdPropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Kratos Identity ID",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const preferredNamePropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Preferred Name",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const responsibilityPropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "responsibility",
  description: `The user's responsibility at the organization (e.g. "Marketing", "Sales", "Engineering", etc.)`,
  possibleValues: [{ primitiveDataType: "Text" }],
});

const ofOrgLinkTypeInitializer = linkTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Of Org",
  description: "Belonging to an organization",
});

const hasMembershipLinkTypeInitializer = linkTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Has Membership",
  description: "Having a membership",
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
    namespace: WORKSPACE_ACCOUNT_SHORTNAME,
    title: "User",
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
  })(graphApi);
};

const componentIdPropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Component ID",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const blockDataLinkTypeInitializer = linkTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Block Data",
  description: "The entity representing the data in a block.",
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
    namespace: WORKSPACE_ACCOUNT_SHORTNAME,
    title: "Block",
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
  })(graphApi);
};

const tokensPropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Text Tokens",
  /**
   * @todo: potentially improve this property type to be composed of nested property type definitions
   * @see https://app.asana.com/0/1202805690238892/1203045933021778/f
   */
  possibleValues: [{ primitiveDataType: "Object" }],
});

const textEntityTypeInitializer = async (graphApi: GraphApi) => {
  /* eslint-disable @typescript-eslint/no-use-before-define */

  const tokensPropertyTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.propertyType.tokens(graphApi);

  /* eslint-enable @typescript-eslint/no-use-before-define */
  return entityTypeInitializer({
    namespace: WORKSPACE_ACCOUNT_SHORTNAME,
    title: "Text",
    properties: [
      {
        propertyTypeModel: tokensPropertyTypeModel,
        required: true,
        array: true,
      },
    ],
    outgoingLinks: [],
  })(graphApi);
};

/**
 * @todo: remove this dummy entity type once we are able to define the block data link type without it
 * @see https://app.asana.com/0/1202805690238892/1203015527055368/f
 */
const dummyEntityTypeInitializer = async (graphApi: GraphApi) => {
  return entityTypeInitializer({
    namespace: WORKSPACE_ACCOUNT_SHORTNAME,
    title: "Dummy",
    properties: [],
    outgoingLinks: [],
  })(graphApi);
};

const archivedPropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Archived",
  description: "Whether or not something has been archived.",
  possibleValues: [{ primitiveDataType: "Boolean" }],
});

const summaryPropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Summary",
  description: "The summary of the something.",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const titlePropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Title",
  description: "The title of something.",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const indexPropertyTypeInitializer = propertyTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Index",
  description:
    "The (fractional) index indicating the current position of something.",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const containsLinkTypeInitializer = linkTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Contains",
  description: "Something containing something.",
});

const parentLinkTypeInitializer = linkTypeInitializer({
  namespace: WORKSPACE_ACCOUNT_SHORTNAME,
  title: "Parent",
  description: "The parent of something.",
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

  const containsLinkTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.contains(graphApi);

  const parentLinkTypeTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.linkType.parent(graphApi);

  const blockEntityTypeModel =
    await WORKSPACE_TYPES_INITIALIZERS.entityType.block(graphApi);

  const namespace = WORKSPACE_ACCOUNT_SHORTNAME;

  const title = "Page";

  /* eslint-enable @typescript-eslint/no-use-before-define */

  return entityTypeInitializer({
    namespace,
    title,
    properties: [
      {
        propertyTypeModel: summaryPropertyTypeModel,
      },
      {
        propertyTypeModel: archivedPropertyTypeModel,
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
        destinationEntityTypeModels: [SELF_REFERENCE_MARKER],
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

    tokens: tokensPropertyTypeInitializer,
  },
  entityType: {
    user: userEntityTypeInitializer,
    org: orgEntityTypeInitializer,
    orgMembership: orgMembershipEntityTypeInitializer,
    block: blockEntityTypeInitializer,
    page: pageEntityTypeInitializer,
    text: textEntityTypeInitializer,
    dummy: dummyEntityTypeInitializer,
  },
  linkType: {
    ofOrg: ofOrgLinkTypeInitializer,
    hasMembership: hasMembershipLinkTypeInitializer,
    blockData: blockDataLinkTypeInitializer,
    contains: containsLinkTypeInitializer,
    parent: parentLinkTypeInitializer,
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
