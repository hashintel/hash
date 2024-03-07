import {
  blockProtocolEntityTypes,
  blockProtocolLinkEntityTypes,
  blockProtocolPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { linkEntityTypeUrl } from "@local/hash-subgraph";

import { enabledIntegrations } from "../../../../integrations/enabled-integrations";
import { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
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
      instantiator: anyUserInstantiator,
    },
  );

  /** Create Google Sheets Integration entity type */

  const associatedWithAccountLinkEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Associated With Account",
        description: "The account that something is associated with.",
        properties: [],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      webShortname: "hash",
      migrationState,
    },
  );

  const actorTypeDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        title: "Actor Type",
        description:
          "The type of thing that can, should or will act on something.",
        enum: ["human", "machine"],
        type: "string",
      },
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
    },
  );

  const _googleSheetsIntegrationEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Google Sheets Integration",
        description: "An integration with Google Sheets.",
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
          {
            linkEntityType:
              blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
            destinationEntityTypes: [
              blockProtocolEntityTypes.query.entityTypeId,
            ],
            minItems: 1,
            maxItems: 1,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  return migrationState;
};

export default migrate;
