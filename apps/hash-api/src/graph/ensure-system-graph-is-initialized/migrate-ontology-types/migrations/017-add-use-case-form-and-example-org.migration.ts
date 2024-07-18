import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createOrg,
  getOrgByShortname,
} from "../../../knowledge/system-types/org";
import type { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
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
      webShortname: "hash",
      migrationState,
    },
  );

  const _prospectiveUserDefinitionEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Prospective User",
        description:
          "Information about a prospective user of an application or system",
        labelProperty: systemPropertyTypes.email.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: systemPropertyTypes.websiteUrl.propertyTypeId,
            required: true,
          },
          {
            propertyType: systemPropertyTypes.email.propertyTypeId,
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
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
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
      entityTypeVersion:
        migrationState.entityTypeVersions[
          systemEntityTypes.organization.entityTypeBaseUrl
        ],
    });
  }

  return migrationState;
};

export default migrate;
