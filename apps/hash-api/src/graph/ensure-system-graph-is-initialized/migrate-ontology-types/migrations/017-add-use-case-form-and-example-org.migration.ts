import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { logger } from "../../../../logger";
import {
  createOrg,
  getOrgByShortname,
} from "../../../knowledge/system-types/org";
import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashPropertyTypeId,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  if (isSelfHostedInstance) {
    /**
     * Functionality is only relevant to hosted HASH, i.e. the instance at https://[app].hash.ai
     */
    return migrationState;
  }

  /**
   * Create the entity type to hold information about a user's potential use(s) of HASH
   */

  const rolePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Role",
        description: "The name of someone or something's role.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const intendedUsePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Intended Use",
        description:
          "The name or description of someone's intended use of something",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const currentApproachPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Current Approach",
        description:
          "The name or description of the current approach to something",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const willingToPayPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Willing To Pay",
        description: "The amount that someone is willing to pay for something",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const _prospectiveUserDefinitionEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Prospective User",
        titlePlural: "Prospective Users",
        icon: "/icons/types/user-plus.svg",
        description:
          "Information about a prospective user of an application or system",
        labelProperty: systemPropertyTypes.email.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "websiteUrl",
              migrationState,
            }),
            required: true,
          },
          {
            propertyType: getCurrentHashPropertyTypeId({
              propertyTypeKey: "email",
              migrationState,
            }),
            required: true,
          },
          {
            propertyType: rolePropertyType,
            required: true,
          },
          {
            propertyType: intendedUsePropertyType,
            required: true,
          },
          {
            propertyType: currentApproachPropertyType,
            required: true,
          },
          {
            propertyType: willingToPayPropertyType,
            required: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  /**
   * Create an `@example` org
   */
  const exampleOrg = await getOrgByShortname(context, authentication, {
    shortname: "example",
  });

  if (!exampleOrg) {
    await createOrg(context, authentication, {
      shortname: "example",
      name: "Example",
      websiteUrl: "https://example.com",
      orgEntityTypeVersion:
        migrationState.entityTypeVersions[
          systemEntityTypes.organization.entityTypeBaseUrl
        ],
      machineEntityTypeVersion:
        migrationState.entityTypeVersions[
          systemEntityTypes.machine.entityTypeBaseUrl
        ],
    });
    logger.info("Created @example org");
  }

  return migrationState;
};

export default migrate;
