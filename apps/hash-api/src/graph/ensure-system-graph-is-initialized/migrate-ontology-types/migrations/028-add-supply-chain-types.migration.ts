import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashDataTypeId,
} from "../util";

import type { MigrationFunction } from "../types";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const datetimeDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "datetime",
    migrationState,
  });

  const productIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Product ID",
        description: "The identifier of a product in a supply-chain dataset.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const siteIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Site ID",
        description: "The identifier of a site in a supply-chain dataset.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const stepIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Step ID",
        description:
          "The identifier of a product step in a supply-chain dataset.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const opportunityTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Opportunity Type",
        description:
          "The broad type of a supply-chain opportunity, such as dwell or planning.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const opportunityKindPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Opportunity Kind",
        description:
          "The specific kind of supply-chain opportunity a status or preference refers to.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const scopeKeyPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Scope Key",
        description:
          "A stable key identifying a supply-chain product step or opportunity scope.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const statusCategoryPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Status Category",
        description: "The category assigned to a supply-chain status report.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const statusTextPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Status Text",
        description: "The text of a supply-chain status report.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const authorIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Status Report Author ID",
        description:
          "The identifier of the user who created a supply-chain status report.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const createdAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Status Report Created At",
        description:
          "The date and time at which a supply-chain status report was created.",
        possibleValues: [{ dataTypeId: datetimeDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const readMarkersPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Supply Chain Read Markers",
        description:
          "The supply-chain opportunity scopes a user has marked as read.",
        possibleValues: [{ primitiveDataType: "object", array: true }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const preferencesUserIdPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Supply Chain Preferences User ID",
        description:
          "The identifier of the user whose supply-chain preferences are stored.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    });

  const preferencesWebIdPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Supply Chain Preferences Web ID",
        description:
          "The identifier of the web the supply-chain preferences apply to.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Supply Chain Status Report",
      titlePlural: "Supply Chain Status Reports",
      description:
        "An authored status update for a supply-chain product step or opportunity.",
      labelProperty: scopeKeyPropertyType.metadata.recordId.baseUrl,
      properties: [
        { propertyType: scopeKeyPropertyType.schema.$id, required: true },
        { propertyType: productIdPropertyType.schema.$id, required: true },
        { propertyType: siteIdPropertyType.schema.$id, required: true },
        { propertyType: stepIdPropertyType.schema.$id, required: true },
        {
          propertyType: opportunityTypePropertyType.schema.$id,
          required: true,
        },
        { propertyType: opportunityKindPropertyType.schema.$id },
        { propertyType: statusCategoryPropertyType.schema.$id, required: true },
        { propertyType: statusTextPropertyType.schema.$id },
        { propertyType: authorIdPropertyType.schema.$id, required: true },
        { propertyType: createdAtPropertyType.schema.$id, required: true },
      ],
    },
    migrationState,
    webShortname: "h",
  });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Supply Chain User Preferences",
      titlePlural: "Supply Chain User Preferences",
      description:
        "User-scoped preferences for supply-chain views in a HASH web.",
      labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
      properties: [
        {
          propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
          required: true,
        },
        {
          propertyType: preferencesUserIdPropertyType.schema.$id,
          required: true,
        },
        {
          propertyType: preferencesWebIdPropertyType.schema.$id,
          required: true,
        },
        { propertyType: readMarkersPropertyType.schema.$id },
      ],
    },
    migrationState,
    webShortname: "h",
  });

  return migrationState;
};

export default migrate;
