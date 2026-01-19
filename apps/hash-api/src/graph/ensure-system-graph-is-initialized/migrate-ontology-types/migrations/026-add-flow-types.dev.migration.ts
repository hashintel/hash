import type { EntityType } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemDataTypeIfNotExists,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashDataTypeId,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeEntitiesToNewTypeVersion,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1: Create generic link types that will be used by Flow types.
   */

  /**
   * "Uses" link type - generic link for when something uses another thing.
   * Used by FlowRun and FlowSchedule to link to FlowDefinition.
   */
  const usesLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Uses",
        titlePlural: "Uses",
        icon: "🔗",
        inverse: {
          title: "Used By",
        },
        description: "Something that uses something else.",
        properties: [],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * "Scheduled By" link type - links a FlowRun to the FlowSchedule that triggered it.
   */
  const scheduledByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Scheduled By",
        titlePlural: "Scheduled By",
        icon: "📅",
        inverse: {
          title: "Scheduled",
        },
        description: "Something that was scheduled by something.",
        properties: [],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 2: create the `Flow Definition` entity type.
   */

  const triggerDefinitionIdPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Trigger Definition ID",
        description: "The ID of the trigger definition.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const outputDefinitionsPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Output Definitions",
        description: "The output definitions of something.",
        possibleValues: [
          {
            primitiveDataType: "object",
            array: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  const triggerDefinitionPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Trigger Definition",
        description: "The trigger definition of a flow.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [triggerDefinitionIdPropertyType.metadata.recordId.baseUrl]: {
                $ref: triggerDefinitionIdPropertyType.schema.$id,
              },
              [outputDefinitionsPropertyType.metadata.recordId.baseUrl]: {
                $ref: outputDefinitionsPropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              triggerDefinitionIdPropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  const stepDefinitionsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Step Definitions",
        description: "The step definitions of a flow.",
        possibleValues: [
          {
            primitiveDataType: "object",
            array: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const flowDefinitionEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flow Definition",
        titlePlural: "Flow Definitions",
        icon: "📋",
        description: "The definition of a HASH flow.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: true,
          },
          {
            propertyType: triggerDefinitionPropertyType,
            required: true,
          },
          {
            propertyType: stepDefinitionsPropertyType,
            required: true,
          },
          {
            propertyType: outputDefinitionsPropertyType,
            required: true,
          },
        ],
      },

      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 3: Create data types and property types for Flow Schedule.
   */

  /**
   * Flow Type data type - whether a flow is an AI flow or an integration flow.
   */
  const flowTypeDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "Flow Type",
        description:
          "The type of a flow, determining which task queue it runs on.",
        enum: ["ai", "integration"],
        type: "string",
      },
      conversions: {},
      webShortname: "h",
      migrationState,
    },
  );

  const scheduleStatusDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "Schedule Status",
        description:
          "The status of a schedule, indicating whether it is currently running or has been temporarily stopped.",
        enum: ["active", "paused"],
        type: "string",
      },
      conversions: {},
      webShortname: "h",
      migrationState,
    },
  );

  const scheduleOverlapPolicyDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "Schedule Overlap Policy",
        description:
          "The policy for handling overlapping runs in a schedule when a new execution is due but the previous one is still running.",
        enum: ["SKIP", "BUFFER_ONE", "ALLOW_ALL", "CANCEL_OTHER"],
        type: "string",
      },
      conversions: {},
      webShortname: "h",
      migrationState,
    },
  );

  const flowTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Flow Type",
        description:
          "The type of a flow, determining which task queue it runs on.",
        possibleValues: [{ dataTypeId: flowTypeDataType.schema.$id }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const scheduleSpecPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Schedule Spec",
        description: "The scheduling specification for a recurring flow.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const scheduleOverlapPolicyPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Schedule Overlap Policy",
        description:
          "The policy for handling overlapping runs when a new scheduled execution is due but the previous one is still running.",
        possibleValues: [
          { dataTypeId: scheduleOverlapPolicyDataType.schema.$id },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  const millisecondDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "millisecond",
    migrationState,
  });

  const scheduleCatchupWindowPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Schedule Catchup Window",
        description: "How far back to catch up missed runs after downtime.",
        possibleValues: [{ dataTypeId: millisecondDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    });

  const pauseOnFailurePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Pause On Failure",
        description: "Whether to automatically pause something when it fails.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Schedule Status property type.
   */
  const scheduleStatusPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Schedule Status",
        description:
          "The current status of a schedule - either active or paused.",
        possibleValues: [{ dataTypeId: scheduleStatusDataType.schema.$id }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const dateTimeDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "datetime",
    migrationState,
  });

  const schedulePausedAtPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Paused At",
        description: "The timestamp at which something was paused.",
        possibleValues: [{ dataTypeId: dateTimeDataTypeId }],
      },
      webShortname: "h",
      migrationState,
    });

  const explanationPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Explanation",
        description: "An explanation or justification for something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Schedule Pause State property type - an object containing pausedAt and optional note.
   */
  const schedulePauseStatePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Schedule Pause State",
        description:
          "The state of a paused schedule, including when it was paused and an optional note.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [schedulePausedAtPropertyType.metadata.recordId.baseUrl]: {
                $ref: schedulePausedAtPropertyType.schema.$id,
              },
              [explanationPropertyType.metadata.recordId.baseUrl]: {
                $ref: explanationPropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              schedulePausedAtPropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  /**
   * Data Sources property type - stores data sources configuration for AI flows.
   */
  const dataSourcesPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Data Sources",
        description: "The data sources configuration for an AI flow.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 2: create the `Flow Run` entity type.
   */

  const outputsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Outputs",
        description: "The outputs of something.",
        possibleValues: [
          /** @todo: consider constraining this type further */
          {
            primitiveDataType: "object",
            array: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const triggerPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Trigger",
        description: "The trigger of a flow.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [triggerDefinitionIdPropertyType.metadata.recordId.baseUrl]: {
                $ref: triggerDefinitionIdPropertyType.schema.$id,
              },
              [outputsPropertyType.metadata.recordId.baseUrl]: {
                $ref: outputsPropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              triggerDefinitionIdPropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Flow Definition ID property type - stores the ID of the flow definition.
   * This is used until we start persisting Flow Definitions to the graph,
   * at which point we'll use the "Uses" link type instead.
   */
  const flowDefinitionIdPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Flow Definition ID",
        description: "The ID of a flow definition.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    });

  const stepsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Step",
        description: "A step in a flow run.",
        possibleValues: [
          /** @todo: consider constraining this type further. */
          {
            primitiveDataType: "object",
            array: true,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 2b: Create the Flow Schedule entity type.
   * This must be created before FlowRun so we can reference it in FlowRun's links.
   */
  const flowScheduleEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flow Schedule",
        titlePlural: "Flow Schedules",
        icon: "🗓️",
        description:
          "A schedule that triggers recurring executions of a flow definition.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: flowDefinitionIdPropertyType,
            required: true,
          },
          {
            propertyType: flowTypePropertyType,
            required: true,
          },
          {
            propertyType: scheduleSpecPropertyType,
            required: true,
          },
          {
            propertyType: scheduleOverlapPolicyPropertyType,
            required: true,
          },
          {
            propertyType: scheduleCatchupWindowPropertyType,
          },
          {
            propertyType: pauseOnFailurePropertyType,
          },
          {
            propertyType: scheduleStatusPropertyType,
            required: true,
          },
          {
            propertyType: schedulePauseStatePropertyType,
          },
          {
            propertyType: dataSourcesPropertyType,
          },
          {
            propertyType: triggerPropertyType,
            required: true,
          },
        ],
        /**
         * Note: The "Uses" link to FlowDefinition is defined here for future use,
         * but is not currently created since Flow Definitions aren't persisted to the graph yet.
         */
        outgoingLinks: [
          {
            linkEntityType: usesLinkEntityType,
            destinationEntityTypes: [flowDefinitionEntityType],
            minItems: 0,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * FlowRun entity type - has flowDefinitionId property and optionally
   * links to FlowSchedule via "Scheduled By".
   * Note: The "Uses" link to FlowDefinition is defined for future use,
   * but flowDefinitionId property is used until Flow Definitions are persisted.
   */
  const flowEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flow Run",
        titlePlural: "Flow Runs",
        icon: "▶️",
        description: "An execution run of a flow.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: flowDefinitionIdPropertyType,
            required: true,
          },
          {
            propertyType: triggerPropertyType,
            required: true,
          },
          {
            propertyType: stepsPropertyType,
            required: true,
          },
          {
            propertyType: outputsPropertyType,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: usesLinkEntityType,
            destinationEntityTypes: [flowDefinitionEntityType],
            minItems: 0,
            maxItems: 1,
          },
          {
            linkEntityType: scheduledByLinkEntityType,
            destinationEntityTypes: [flowScheduleEntityType],
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 3: Create a 'Claim' entity type.
   *
   * Each claim has a subject, and may have an object.
   * The subject and object may be only plain text, or potentially also a linked entity if and when one is available.
   */
  const objectPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Object",
        description: "What something is directed towards.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const subjectPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Subject",
        description: "A thing or theme that something is about.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasSubjectEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Subject",
        /** @todo icon */
        inverse: {
          title: "Subject Of",
        },
        description: "The subject something has",
        properties: [],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const hasObjectEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Object",
        /** @todo icon */
        inverse: {
          title: "Object Of",
        },
        description: "The object something has",
        properties: [],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const _claimEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Claim",
        titlePlural: "Claims",
        icon: "💬",
        description: "A claim made about something.",
        properties: [
          {
            propertyType:
              blockProtocolPropertyTypes.textualContent.propertyTypeId,
            required: true,
          },
          {
            propertyType: subjectPropertyType,
            required: true,
          },
          {
            propertyType: objectPropertyType,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasSubjectEntityType,
          },
          {
            linkEntityType: hasObjectEntityType,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 4: create a `Incurred In` link entity type
   */

  const incurredInLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Incurred In",
        icon: "💰",
        inverse: {
          title: "Incurred",
        },
        description: "Something that was incurred in something else.",
        properties: [],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 4: Update the Usage Record entity type to:
   * 1. Accept an 'Incurred In' link
   * 2. Accept custom metadata
   */

  const currentUsageRecordEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "usageRecord",
    migrationState,
  });

  const usageRecordEntityType = await getEntityTypeById(
    context.graphApi,
    authentication,
    {
      entityTypeId: currentUsageRecordEntityTypeId,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  if (!usageRecordEntityType) {
    throw new NotFoundError(
      `Could not find entity type with ID ${currentUsageRecordEntityTypeId}`,
    );
  }

  const customMetadataPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Custom Metadata",
        description: "Additional information about something.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const newUsageRecordEntityTypeSchema: EntityType = {
    ...usageRecordEntityType.schema,
    properties: {
      ...usageRecordEntityType.schema.properties,
      [customMetadataPropertyType.metadata.recordId.baseUrl]: {
        $ref: customMetadataPropertyType.schema.$id,
      },
    },
    links: {
      ...usageRecordEntityType.schema.links,
      [incurredInLinkEntityType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: flowEntityType.schema.$id }],
        },
      },
    },
  };

  const { updatedEntityTypeId: _updatedUsageRecordEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentUsageRecordEntityTypeId,
      migrationState,
      newSchema: newUsageRecordEntityTypeSchema,
    });

  /**
   * Step 4: Upgrade existing usage record entities to the latest version
   */

  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: [systemEntityTypes.usageRecord.entityTypeBaseUrl],
    migrationState,
  });

  return migrationState;
};

export default migrate;
