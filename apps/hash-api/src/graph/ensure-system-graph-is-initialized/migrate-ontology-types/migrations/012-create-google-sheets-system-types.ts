import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  BaseUrl,
  fileUrlPropertyTypeUrl,
  linkEntityTypeUrl,
} from "@local/hash-subgraph";
import { versionedUrlFromComponents } from "@local/hash-subgraph/type-system-patch";

import { enabledIntegrations } from "../../../../integrations/enabled-integrations";
import { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashLinkEntityTypeId,
  getCurrentHashPropertyTypeId,
  getCurrentHashSystemEntityTypeId,
} from "../util";

// google user
//
// id: '107859988627014058933',
// email: 'cmorinan@gmail.com',
// verified_email: true,
// name: 'Ciaran Morinan',
// given_name: 'Ciaran',
// family_name: 'Morinan',
// picture: 'https://lh3.googleusercontent.com/a/ACg8ocIspwv1Em_t6bDaSDco92RHa42FXkB6Wukh4RLbgBFs=s96-c',
// locale: 'en-GB'

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

  const avatarUrlPropertyType = getCurrentHashPropertyTypeId({
    migrationState,
    propertyTypeKey: "avatarUrl",
  });

  const googleAccountEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Google Account",
        description: "A Google user account.",
        properties: [
          {
            propertyType: emailPropertyType,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.displayName.propertyTypeId,
            required: true,
          },
          {
            propertyType: avatarUrlPropertyType,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /** Create Google Sheets Integration entity type */

  const usesUserSecretLinkEntityType = getCurrentHashLinkEntityTypeId({
    migrationState,
    linkEntityTypeKey: "usesUserSecret",
  });

  const userSecretEntityType = getCurrentHashSystemEntityTypeId({
    migrationState,
    entityTypeKey: "userSecret",
  });

  const googleSheetsIntegrationEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Google Sheets Integration",
        description: "An instance of an integration with Google Sheets.",
        properties: [
          {
            propertyType: fileUrlPropertyTypeUrl,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: usesUserSecretLinkEntityType,
            destinationEntityTypes: [userSecretEntityType],
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
