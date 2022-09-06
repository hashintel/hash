import { Logger } from "@hashintel/hash-backend-utils/logger";
import { AxiosError } from "axios";
import { PropertyType, EntityType } from "@blockprotocol/type-system-web";
import { GraphApi } from "@hashintel/hash-graph-client";

import {
  DataTypeModel,
  EntityTypeModel,
  PropertyTypeModel,
  AccountFields,
  userEntityType,
  orgNamePropertyTypeInitializer,
  orgSizePropertyTypeInitializer,
  orgProvidedInfoPropertyTypeInitializer,
  orgEntityTypeInitializer,
} from "../model";
import { logger } from "../logger";
import {
  generateWorkspacePropertyTypeSchema,
  primitiveDataTypeVersionedUris,
  propertyTypeInitializer,
  workspaceAccountId,
} from "../model/util";
import {
  accountIdPropertyTypeInitializer,
} from "../model/knowledge/account.fields";

export let WORKSPACE_TYPES: {
  data_type: {};
  property_type: {
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
  entity_type: {
    user: EntityTypeModel;
    org: EntityTypeModel;
  };
  link_type: {};
};

export const WORKSPACE_TYPE_INITIALIZERS: {
  [P in keyof typeof WORKSPACE_TYPES]?: (graphApi?: GraphApi) => Promise<typeof WORKSPACE_TYPES[P]>;
} = {
  property_type: {
    accountId: accountIdPropertyTypeInitializer,
    shortName: ,

    email: 
    kratosIdentityId: 
    preferredName: 

    orgName: orgNamePropertyTypeInitializer,
    orgSize: orgSizePropertyTypeInitializer,
    orgProvidedInfo: orgProvidedInfoPropertyTypeInitializer,
  },
  entity_type: {
    user: 
    org: orgEntityTypeInitializer
  }
};

const workspaceEntityTypes: EntityType[] = [userEntityType, orgEntityType];

/**
 * A script that ensures the required primitive data types and workspace types
 * have been created in the graph.
 */
export const ensureWorkspaceTypesExist = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi } = params;

  // First let's ensure the required data types are in the datastore
  await Promise.all(
    Object.entries(primitiveDataTypeVersionedUris).map(
      async ([title, versionedUri]) => {
        const dataType = await DataTypeModel.get(graphApi, {
          versionedUri,
        }).catch((error: AxiosError) =>
          error.response?.status === 404 ? null : Promise.reject(error),
        );

        if (!dataType) {
          throw new Error(
            `Primitive data type "${title}" with versioned URI "${versionedUri}" not found`,
          );
        }
      },
    ),
  );

  // Next, let's create workspace property types if they don't already exist
  // This is done sequentially as property types might reference other property
  // types
  /**
   * @todo Use transactional primitive/bulk insert to be able to do this in parallel
   *   see the following task:
   *   https://app.asana.com/0/1201095311341924/1202573572594586/f
   */

  //    .catch((error: AxiosError) =>
  //    error.response?.status === 404 ? null : Promise.reject(error),
  //  );

  const shortnamePropertyType = await PropertyTypeModel.create(graphApi, {
    accountId: workspaceAccountId,
    schema: generateWorkspacePropertyTypeSchema(shortnamePropertyTypeParams),
  });

  const accountIdPropertyType = await PropertyTypeModel.create(graphApi, {
    accountId: workspaceAccountId,
    schema: generateWorkspacePropertyTypeSchema(accountIdPropertyTypeParams),
  });

  const emailPropertyType = await PropertyTypeModel.create(graphApi, {
    accountId: workspaceAccountId,
    schema: generateWorkspacePropertyTypeSchema(emailPropertyTypeParams),
  });
  const kratosIdentityIdPropertyType = await PropertyTypeModel.create(
    graphApi,
    {
      accountId: workspaceAccountId,
      schema: generateWorkspacePropertyTypeSchema(
        kratosIdentityIdPropertyTypeParams,
      ),
    },
  );
  const preferredNamePropertyType = await PropertyTypeModel.create(graphApi, {
    accountId: workspaceAccountId,
    schema: generateWorkspacePropertyTypeSchema(
      preferredNamePropertyTypeParams,
    ),
  });

  for (const schema of workspacePropertyTypes) {
    const { $id: versionedUri } = schema;
    const existingPropertyType = await PropertyTypeModel.get(graphApi, {
      versionedUri,
    }).catch((error: AxiosError) =>
      error.response?.status === 404 ? null : Promise.reject(error),
    );

    if (!existingPropertyType) {
      await PropertyTypeModel.create(graphApi, {
        accountId: workspaceAccountId,
        schema,
      });
      logger.info(`Created property type with versioned URI "${versionedUri}"`);
    }
  }

  // Finally, let's ensure all workspace entity types have been created
  await Promise.all(
    workspaceEntityTypes.map(async (schema) => {
      const { $id: versionedUri } = schema;
      const existingEntityType = await EntityTypeModel.get(graphApi, {
        versionedUri,
      }).catch((error: AxiosError) =>
        error.response?.status === 404 ? null : Promise.reject(error),
      );

      if (!existingEntityType) {
        await EntityTypeModel.create(graphApi, {
          accountId: workspaceAccountId,
          schema,
        });

        logger.info(`Created entity type with versioned URI "${versionedUri}"`);
      }
    }),
  );
};
