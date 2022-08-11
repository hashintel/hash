import {
  GraphApi,
  EntityType,
  PropertyType,
} from "@hashintel/hash-graph-client";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { AxiosError } from "axios";
import { DataTypeModel, EntityTypeModel, PropertyTypeModel } from "../model";
import { logger } from "../logger";
import {
  primitiveDataTypeVersionedUris,
  generateSchemaBaseUri,
  generateWorkspacePropertyTypeSchema,
  generateWorkspaceEntityTypeSchema,
  worskspaceTypesNamespaceUri,
  workspaceAccountId,
} from "../model/util";

// Generate the schema for the shortname property type
const shortnamePropertyType = generateWorkspacePropertyTypeSchema({
  title: "Shortname",
  possibleValues: [{ primitiveDataType: "Text" }],
});

// Generate the schema for the email property type
const emailPropertyType = generateWorkspacePropertyTypeSchema({
  title: "Email",
  possibleValues: [{ primitiveDataType: "Text" }],
});

const workspacePropertyTypes: PropertyType[] = [
  shortnamePropertyType,
  emailPropertyType,
];

// Generate the schema for the user entity type
const userEntityType = generateWorkspaceEntityTypeSchema({
  title: "User",
  properties: [
    {
      baseUri: generateSchemaBaseUri({
        namespaceUri: worskspaceTypesNamespaceUri,
        kind: "propertyType",
        title: "Shortname",
      }),
      versionedUri: shortnamePropertyType.$id,
    },
    {
      baseUri: generateSchemaBaseUri({
        namespaceUri: worskspaceTypesNamespaceUri,
        kind: "propertyType",
        title: "Email",
      }),
      versionedUri: emailPropertyType.$id,
      required: true,
      /** @todo: un-comment the next two lines when a related Graph API bug is fixed */
      //   array: true,
      //   minItems: 1,
    },
  ],
});

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
          schema,
        });

        logger.info(`Created entity type with versioned URI "${versionedUri}"`);
      }
    }),
  );
};
