import { Logger } from "@hashintel/hash-backend-utils/logger";
import { AxiosError } from "axios";
import { PropertyType, EntityType } from "@blockprotocol/type-system-web";
/** @todo migrate the below types to the type system package types. */
import { GraphApi } from "@hashintel/hash-graph-client";

import {
  DataTypeModel,
  EntityTypeModel,
  PropertyTypeModel,
  shortnamePropertyType,
  kratosIdentityIdPropertyType,
  emailPropertyType,
  userEntityType,
  accountIdPropertyType,
  preferredNamePropertyType,
} from "../model";
import { logger } from "../logger";
import {
  primitiveDataTypeVersionedUris,
  workspaceAccountId,
} from "../model/util";

const workspacePropertyTypes: PropertyType[] = [
  shortnamePropertyType,
  emailPropertyType,
  kratosIdentityIdPropertyType,
  accountIdPropertyType,
  preferredNamePropertyType,
];

const workspaceEntityTypes: EntityType[] = [userEntityType];

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

  // Next, let's ensure all workspace property types have been created
  await Promise.all(
    workspacePropertyTypes.map(async (schema) => {
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
        logger.info(
          `Created property type with versioned URI "${versionedUri}"`,
        );
      }
    }),
  );

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
          schema: schema as any, // TODO - trust me bro
        });

        logger.info(`Created entity type with versioned URI "${versionedUri}"`);
      }
    }),
  );
};
