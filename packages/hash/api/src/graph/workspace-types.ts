import { Logger } from "@hashintel/hash-backend-utils/logger";
import { WORKSPACE_ACCOUNT_SHORTNAME } from "@hashintel/hash-backend-utils/system";
import { GraphApi } from "@hashintel/hash-graph-client";
import { logger } from "../logger";

import { EntityTypeModel, LinkTypeModel, PropertyTypeModel } from "../model";
import {
  propertyTypeInitializer,
  entityTypeInitializer,
  linkTypeInitializer,
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
  };
  entityType: {
    user: EntityTypeModel;
    org: EntityTypeModel;
    orgMembership: EntityTypeModel;
  };
  linkType: {
    // User-related
    hasMembership: LinkTypeModel;

    // OrgMembership-related
    ofOrg: LinkTypeModel;
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
        propertyTypeBaseUri: shortnamePropertyTypeModel.baseUri,
        propertyTypeVersionedUri: shortnamePropertyTypeModel.schema.$id,
        required: true,
      },
      {
        propertyTypeBaseUri: orgNamePropertyTypeModel.baseUri,
        propertyTypeVersionedUri: orgNamePropertyTypeModel.schema.$id,
        required: true,
      },
      {
        propertyTypeBaseUri: orgProvidedInfoPropertyTypeModel.baseUri,
        propertyTypeVersionedUri: orgProvidedInfoPropertyTypeModel.schema.$id,
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
        propertyTypeBaseUri: responsibilityPropertyTypeModel.baseUri,
        propertyTypeVersionedUri: responsibilityPropertyTypeModel.schema.$id,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkTypeVersionedUri: ofOrgLinkTypeModel.schema.$id,
        destinationEntityTypeVersionedUri: orgEntityTypeModel.schema.$id,
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
        propertyTypeBaseUri: shortnamePropertyTypeModel.baseUri,
        propertyTypeVersionedUri: shortnamePropertyTypeModel.schema.$id,
      },
      {
        propertyTypeBaseUri: emailPropertyTypeModel.baseUri,
        propertyTypeVersionedUri: emailPropertyTypeModel.schema.$id,
        required: true,
        array: { minItems: 1 },
      },
      {
        propertyTypeBaseUri: kratosIdentityIdPropertyTypeModel.baseUri,
        propertyTypeVersionedUri: kratosIdentityIdPropertyTypeModel.schema.$id,
        required: true,
      },
      {
        propertyTypeBaseUri: preferredNamePropertyTypeModel.baseUri,
        propertyTypeVersionedUri: preferredNamePropertyTypeModel.schema.$id,
        required: true,
      },
    ],
    outgoingLinks: [
      {
        linkTypeVersionedUri: hasMembershipLinkTypeModel.schema.$id,
        destinationEntityTypeVersionedUri:
          orgMembershipEntityTypeModel.schema.$id,
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
  },
  entityType: {
    user: userEntityTypeInitializer,
    org: orgEntityTypeInitializer,
    orgMembership: orgMembershipEntityTypeInitializer,
  },
  linkType: {
    ofOrg: ofOrgLinkTypeInitializer,
    hasMembership: hasMembershipLinkTypeInitializer,
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
