import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createSystemDataTypeIfNotExists,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashPropertyTypeId,
} from "../util";

import type { MigrationFunction } from "../types";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const scopeKeyPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Scope Key",
        description: "A stable key identifying something within a scope.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const statusCategoryDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "Opportunity Status Category",
        description:
          "The category of a status update left against an opportunity.",
        enum: [
          "Investigation started",
          "Investigation update",
          "Investigation concluded",
          "Rejected (infeasible)",
          "Rejected (data issue)",
        ],
        type: "string",
      },
      conversions: {},
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
        possibleValues: [{ dataTypeId: statusCategoryDataType.schema.$id }],
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

  const readItemPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Read Item",
        description: "An item which has been read by someone or something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const siteCodePropertyTypeId = getCurrentHashPropertyTypeId({
    propertyTypeKey: "siteCode",
    migrationState,
  });

  // The frontend records opportunity status through the generic GraphQL entity
  // path, so this intentionally remains a reusable opportunity status type
  // rather than a supply-chain-only status report helper.
  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Opportunity Status Update",
      titlePlural: "Opportunity Status Updates",
      description:
        "A status update for an opportunity for change or improvement.",
      labelProperty: scopeKeyPropertyType.metadata.recordId.baseUrl,
      properties: [
        { propertyType: scopeKeyPropertyType.schema.$id, required: true },
        { propertyType: siteCodePropertyTypeId, required: true },
        { propertyType: statusCategoryPropertyType.schema.$id, required: true },
        { propertyType: statusTextPropertyType.schema.$id },
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
      properties: [
        { propertyType: readItemPropertyType.schema.$id, array: true },
      ],
    },
    migrationState,
    webShortname: "h",
  });

  return migrationState;
};

export default migrate;
