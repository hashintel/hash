import type { EntityType } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
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
   * Step 1: create the `Flow Definition` entity type.
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

  const _flowDefinitionEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flow Definition",
        titlePlural: "Flow Definitions",
        /** @todo icon */

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

  const flowDefinitionIdPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Flow Definition ID",
        description:
          "The ID of the flow definition (the `entityId` of the flow definition entity).",
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

  const flowEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flow Run",
        titlePlural: "Flow Runs",
        /** @todo icon */
        description: "An execution run of a flow.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: triggerPropertyType,
            required: true,
          },
          {
            propertyType: flowDefinitionIdPropertyType,
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
        /** @todo icon */
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
        /** @todo icon */
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
