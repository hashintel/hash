import {
  blockProtocolDataTypes,
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { enabledIntegrations } from "../../../../integrations/enabled-integrations";
import type { MigrationFunction } from "../types";
import {
  createSystemDataTypeIfNotExists,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashLinkEntityTypeId,
  getCurrentHashPropertyTypeId,
  getCurrentHashSystemEntityTypeId,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  if (!enabledIntegrations.googleSheets) {
    return migrationState;
  }

  /** Create Google Account entity type */

  const emailPropertyType = getCurrentHashPropertyTypeId({
    migrationState,
    propertyTypeKey: "email",
  });

  const usesUserSecretLinkEntityType = getCurrentHashLinkEntityTypeId({
    migrationState,
    linkEntityTypeKey: "usesUserSecret",
  });

  const userSecretEntityType = getCurrentHashSystemEntityTypeId({
    migrationState,
    entityTypeKey: "userSecret",
  });

  const accountIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Account Id",
        description: "A unique identifier for a Google account.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "google",
      migrationState,
    },
  );

  const googleAccountEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Account",
        titlePlural: "Accounts",
        icon: "/icons/types/google.svg",
        description: "A Google user account.",
        properties: [
          {
            propertyType: accountIdPropertyType,
            required: true,
          },
          {
            propertyType: emailPropertyType,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.displayName.propertyTypeId,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: usesUserSecretLinkEntityType,
            destinationEntityTypes: [userSecretEntityType],
            minItems: 0,
            maxItems: 1,
          },
        ],
      },
      webShortname: "google",
      migrationState,
    },
  );

  /**
   * Create a Google Sheets File entity type.
   */
  const associatedWithAccountLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Associated With Account",
        inverse: {
          title: "Account For",
        },
        description: "The account that something is associated with.",
        properties: [],
      },
      webShortname: "h",
      migrationState,
    });

  const fileIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "File Id",
        description: "A system identifier for a file.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const actorTypeDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "Actor Type",
        description:
          "The type of thing that can, should or will act on something.",
        enum: ["user", "machine"],
        type: "string",
      },
      conversions: {},
      webShortname: "h",
      migrationState,
    },
  );

  const dataAudiencePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Data Audience",
        description: "The expected audience for some data.",
        possibleValues: [{ dataTypeId: actorTypeDataType.schema.$id }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const currentFileEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "file",
    migrationState,
  });

  const spreadsheetFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [currentFileEntityTypeId],
        title: "Spreadsheet File",
        titlePlural: "Spreadsheet Files",
        icon: "/icons/types/file-spreadsheet.svg",
        description: "A spreadsheet file.",
      },
      webShortname: "h",
      migrationState,
    },
  );

  const _googleSheetsFileEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [spreadsheetFileEntityType.schema.$id],
        title: "Google Sheets File",
        titlePlural: "Google Sheets Files",
        description: "A Google Sheets file.",
        properties: [
          {
            propertyType: fileIdPropertyType,
            required: true,
          },
          {
            propertyType: dataAudiencePropertyType,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: associatedWithAccountLinkEntityType,
            destinationEntityTypes: [googleAccountEntityType],
            minItems: 1,
            maxItems: 1,
          },
        ],
      },
      webShortname: "google",
      migrationState,
    },
  );

  return migrationState;
};

export default migrate;
