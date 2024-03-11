import { linkEntityTypeUrl } from "@local/hash-subgraph";

import { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getExistingHashLinkEntityTypeId,
  getExistingHashPropertyTypeId,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1: Create the `Web Page` entity type
   */

  const titlePropertyTypeId = getExistingHashPropertyTypeId({
    propertyTypeKey: "title",
    migrationState,
  });

  const urlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "URL",
        description: "The URL (Uniform Resource Locator) of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const webPageEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Web Page",
        description: "A page on a website",
        properties: [
          {
            propertyType: urlPropertyType.schema.$id,
            required: true,
          },
          {
            propertyType: titlePropertyTypeId,
            required: false,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /**
   * Step 2: Create the `Research Task` entity type
   */

  const promptPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Prompt",
        description: "The prompt of something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const completedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Completed At",
        description: "The timestamp when something has completed.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const usedResourceLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Used Resource",
        description: "A resource that was used by something.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const createdLinkEntityTypeId = getExistingHashLinkEntityTypeId({
    linkEntityTypeKey: "created",
    migrationState,
  });

  const _researchTaskEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Research Task",
        description: "A task to research something.",
        properties: [
          {
            propertyType: promptPropertyType.schema.$id,
            required: true,
          },
          {
            propertyType: completedAtPropertyType,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: usedResourceLinkEntityType.schema.$id,
            destinationEntityTypes: [webPageEntityType.schema.$id],
          },
          {
            linkEntityType: createdLinkEntityTypeId,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  return migrationState;
};

export default migrate;
