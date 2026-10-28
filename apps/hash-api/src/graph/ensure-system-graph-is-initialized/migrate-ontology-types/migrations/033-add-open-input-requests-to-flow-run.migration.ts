import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createSystemPropertyTypeIfNotExists,
  generateSystemEntityTypeSchema,
  getCurrentHashDataTypeId,
  getCurrentHashLinkEntityTypeId,
  getCurrentHashPropertyTypeId,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeDependenciesInHashEntityType,
} from "../util";

import type { MigrationFunction } from "../types";

/**
 * Gives a `Flow Run` entity what lists of runs show, so that they don't read the run's history: its open input
 * requests, which change only when a request is raised or answered, and its status and when it started and closed.
 */
const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1: Create the `Open Input Request` property type. Each request is an opaque object (`ExternalInputRequest`
   * in `@local/hash-isomorphic-utils`), as a run's inputs and outputs are.
   */
  const openInputRequestPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Open Input Request",
        description:
          "A request for input from outside something, which hasn't been answered yet.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    });

  /**
   * Step 2: Create the `Started At` and `Closed At` property types.
   */
  const datetimeDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "datetime",
    migrationState,
  });

  const startedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Started At",
        description: "When something started.",
        possibleValues: [{ dataTypeId: datetimeDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const closedAtPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Closed At",
        description: "When something closed, however it ended.",
        possibleValues: [{ dataTypeId: datetimeDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 3: Add them to `Flow Run`, with `Status` holding the run's status.
   */
  const currentFlowRunEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "flowRun",
    migrationState,
  });

  const getPropertyTypeId = (
    propertyTypeKey: Parameters<
      typeof getCurrentHashPropertyTypeId
    >[0]["propertyTypeKey"],
  ) => getCurrentHashPropertyTypeId({ propertyTypeKey, migrationState });

  const { updatedEntityTypeId: updatedFlowRunEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentFlowRunEntityTypeId,
      migrationState,
      newSchema: generateSystemEntityTypeSchema({
        entityTypeId: currentFlowRunEntityTypeId,
        title: "Flow Run",
        titlePlural: "Flow Runs",
        icon: "/icons/types/circle-play.svg",
        description: "An execution run of a flow.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: getPropertyTypeId("workflowId"),
            required: true,
          },
          {
            propertyType: getPropertyTypeId("inputs"),
            required: true,
          },
          { propertyType: getPropertyTypeId("outputs") },
          { propertyType: openInputRequestPropertyType, array: true },
          { propertyType: getPropertyTypeId("status") },
          { propertyType: startedAtPropertyType },
          { propertyType: closedAtPropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: getCurrentHashLinkEntityTypeId({
              linkEntityTypeKey: "uses",
              migrationState,
            }),
            destinationEntityTypes: [
              getCurrentHashSystemEntityTypeId({
                entityTypeKey: "flowDefinition",
                migrationState,
              }),
            ],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: getCurrentHashLinkEntityTypeId({
              linkEntityTypeKey: "triggeredBy",
              migrationState,
            }),
            destinationEntityTypes: [
              getCurrentHashSystemEntityTypeId({
                entityTypeKey: "flowTrigger",
                migrationState,
              }),
            ],
            maxItems: 1,
          },
        ],
      }),
    });

  /**
   * Step 4: Update `Usage Record`, which can be incurred in a flow run, to link to the new `Flow Run` type.
   */
  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [updatedFlowRunEntityTypeId],
    dependentEntityTypeKeys: ["usageRecord"],
    migrationState,
  });

  return migrationState;
};

export default migrate;
