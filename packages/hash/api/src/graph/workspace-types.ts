import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";

import {
  EntityTypeModel,
  PropertyTypeModel,
  orgNamePropertyTypeInitializer,
  orgSizePropertyTypeInitializer,
  orgProvidedInfoPropertyTypeInitializer,
  orgEntityTypeInitializer,
  emailPropertyTypeInitializer,
  kratosIdentityIdPropertyTypeInitializer,
  preferredNamePropertyTypeInitializer,
  userEntityTypeInitializer,
} from "../model";
import {} from "../model/util";
import {
  accountIdPropertyTypeInitializer,
  shortnamePropertyTypeInitializer,
} from "../model/knowledge/account.fields";

/** @todo - Add */
// eslint-disable-next-line import/no-mutable-exports
export let WORKSPACE_TYPES: {
  dataType: {};
  propertyType: {
    // General account related
    accountId: PropertyTypeModel;
    shortName: PropertyTypeModel;

    // User-related
    email: PropertyTypeModel;
    kratosIdentityId: PropertyTypeModel;
    preferredName: PropertyTypeModel;

    // Org-related
    orgName: PropertyTypeModel;
    orgSize: PropertyTypeModel;
    orgProvidedInfo: PropertyTypeModel;
  };
  entityType: {
    user: EntityTypeModel;
    org: EntityTypeModel;
  };
  linkType: {};
};

type Promisify<T> = (graphApi: GraphApi) => Promise<T>;

type FlattenAndPromisify<T> = {
  [K in keyof T]: T[K] extends object
    ? { [I in keyof T[K]]: Promisify<T[K][I]> }
    : never;
};

export const WORKSPACE_TYPES_INITIALIZERS: FlattenAndPromisify<
  typeof WORKSPACE_TYPES
> = {
  dataType: {},
  propertyType: {
    accountId: accountIdPropertyTypeInitializer,
    shortName: shortnamePropertyTypeInitializer,

    email: emailPropertyTypeInitializer,
    kratosIdentityId: kratosIdentityIdPropertyTypeInitializer,
    preferredName: preferredNamePropertyTypeInitializer,

    orgName: orgNamePropertyTypeInitializer,
    orgSize: orgSizePropertyTypeInitializer,
    orgProvidedInfo: orgProvidedInfoPropertyTypeInitializer,
  },
  entityType: {
    user: userEntityTypeInitializer,
    org: orgEntityTypeInitializer,
  },
  linkType: {},
};

/**
 * A script that ensures the required primitive data types and workspace types
 * have been created in the graph.
 */
export const ensureWorkspaceTypesExist = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi } = params;

  // Next, create workspace types if they don't already exist
  /**
   * @todo Use transactional primitive/bulk insert to be able to do this in parallel
   *   see the following task:
   *   https://app.asana.com/0/1201095311341924/1202573572594586/f
   */

  // eslint-disable-next-line guard-for-in
  for (const typeKind in WORKSPACE_TYPES_INITIALIZERS) {
    const inner =
      WORKSPACE_TYPES_INITIALIZERS[
        typeKind as keyof typeof WORKSPACE_TYPES_INITIALIZERS
      ];
    for (const typeInitializer of Object.values(inner)) {
      await typeInitializer(graphApi);
    }
  }
};
