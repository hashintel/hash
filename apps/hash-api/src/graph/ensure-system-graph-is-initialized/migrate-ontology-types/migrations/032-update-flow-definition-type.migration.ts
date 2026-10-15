import { createPolicy, queryPolicies } from "@local/hash-graph-sdk/policy";
import {
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getOrgByShortname } from "../../../knowledge/system-types/org";
import { readFlowDefinitionSnapshot } from "../flow-definition-snapshots";
import { seedFlowDefinitions } from "../seed-flow-definitions";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  generateSystemEntityTypeSchema,
  getCurrentHashLinkEntityTypeId,
  getCurrentHashSystemEntityTypeId,
  getCurrentHashPropertyTypeId,
  updateSystemEntityType,
  upgradeDependenciesInHashEntityType,
} from "../util";

import type { MigrationFunction } from "../types";

/**
 * Separates what a flow does from how it is triggered, and relates flows, triggers and runs with links:
 * - `Flow Definition` matches the `FlowDefinition` type in `@local/hash-isomorphic-utils`: a flow declares its
 *   inputs, rather than a trigger with outputs.
 * - `Flow Trigger` is new: something that starts runs of the flow it `Uses`. `Flow Schedule` is a kind of it.
 * - `Flow Run` `Uses` the flow definition it runs, and is `Triggered By` the trigger that started it, if any.
 * - The flows HASH provides are seeded as `Flow Definition` entities.
 *
 * No `Flow Definition` entities exist yet, so none need migrating.
 */
const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1: Update the `Flow Definition` entity type: a flow declares its inputs, replacing `Trigger Definition`.
   *
   * Each input, step and output definition is an opaque object, held in an array: its structure is validated by
   * `validateFlowDefinition`, not by the ontology. These singular property types replace the `Step Definitions` and
   * `Output Definitions` arrays. Which worker runs a flow is derived from its actions, so isn't recorded.
   */
  const createDefinitionPropertyType = (title: string, description: string) =>
    createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title,
        description,
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    });

  const inputDefinitionPropertyType = await createDefinitionPropertyType(
    "Input Definition",
    "The definition of an input to something.",
  );

  const stepDefinitionPropertyType = await createDefinitionPropertyType(
    "Step Definition",
    "The definition of a step in something.",
  );

  const outputDefinitionPropertyType = await createDefinitionPropertyType(
    "Output Definition",
    "The definition of an output of something.",
  );

  const currentFlowDefinitionEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "flowDefinition",
    migrationState,
  });

  const getPropertyTypeId = (
    propertyTypeKey: Parameters<
      typeof getCurrentHashPropertyTypeId
    >[0]["propertyTypeKey"],
  ) => getCurrentHashPropertyTypeId({ propertyTypeKey, migrationState });

  const { updatedEntityTypeId: updatedFlowDefinitionEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentFlowDefinitionEntityTypeId,
      migrationState,
      newSchema: generateSystemEntityTypeSchema({
        entityTypeId: currentFlowDefinitionEntityTypeId,
        title: "Flow Definition",
        titlePlural: "Flow Definitions",
        icon: "/icons/types/diagram-project.svg",
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
            propertyType: inputDefinitionPropertyType,
            required: true,
            array: true,
          },
          {
            propertyType: stepDefinitionPropertyType,
            required: true,
            array: true,
          },
          {
            propertyType: outputDefinitionPropertyType,
            required: true,
            array: true,
          },
        ],
      }),
    });

  /**
   * Step 2: Create the `Flow Trigger` entity type: something that starts runs of the flow it `Uses`, giving values
   * for some or all of its inputs. Triggers are separate from flow definitions, so that different users can trigger
   * the same flow in different ways.
   *
   * Each kind of trigger (e.g. `Flow Schedule`) is a subtype, with the properties that configure it.
   */
  const inputsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Inputs",
        description: "The inputs given to something.",
        possibleValues: [{ primitiveDataType: "object", array: true }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const usesLinkEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "uses",
    migrationState,
  });

  const flowTriggerEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flow Trigger",
        titlePlural: "Flow Triggers",
        icon: "/icons/types/bolt.svg",
        description:
          "Something that starts runs of a flow, giving values for its inputs.",
        properties: [{ propertyType: inputsPropertyType }],
        outgoingLinks: [
          {
            linkEntityType: usesLinkEntityTypeId,
            destinationEntityTypes: [updatedFlowDefinitionEntityTypeId],
            minItems: 1,
            maxItems: 1,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 3: Create the `Triggered By` link type, from a flow run to the trigger that started it.
   */
  const triggeredByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Triggered By",
        titlePlural: "Triggered By",
        icon: "/icons/types/bolt.svg",
        inverse: {
          title: "Triggered",
        },
        description: "Something that was triggered by something else.",
        properties: [],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 4: Make `Flow Schedule` a kind of `Flow Trigger`. Its flow, and the values it gives the flow's inputs,
   * are inherited, replacing its `Flow Definition ID`, `Flow Type` and `Trigger` properties: its task queue is
   * derived from the flow's actions.
   */
  const currentFlowScheduleEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "flowSchedule",
    migrationState,
  });

  await updateSystemEntityType(context, authentication, {
    currentEntityTypeId: currentFlowScheduleEntityTypeId,
    migrationState,
    newSchema: generateSystemEntityTypeSchema({
      entityTypeId: currentFlowScheduleEntityTypeId,
      allOf: [flowTriggerEntityType.schema.$id],
      title: "Flow Schedule",
      titlePlural: "Flow Schedules",
      icon: "/icons/types/calendar-clock.svg",
      description: "A flow trigger that starts runs of a flow on a schedule.",
      labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
      properties: [
        {
          propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
          required: true,
        },
        {
          propertyType: getPropertyTypeId("scheduleSpec"),
          required: true,
        },
        {
          propertyType: getPropertyTypeId("scheduleOverlapPolicy"),
          required: true,
        },
        { propertyType: getPropertyTypeId("scheduleCatchupWindow") },
        { propertyType: getPropertyTypeId("pauseOnFailure") },
        {
          propertyType: getPropertyTypeId("scheduleStatus"),
          required: true,
        },
        { propertyType: getPropertyTypeId("schedulePauseState") },
        { propertyType: getPropertyTypeId("dataSources") },
      ],
    }),
  });

  /**
   * Step 5: Update `Flow Run`: a run links to the flow it runs, and to the trigger that started it if any,
   * replacing its `Flow Definition ID` property and `Scheduled By` link; and records the values given to the
   * flow's inputs, replacing its `Trigger` property.
   */
  const currentFlowRunEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "flowRun",
    migrationState,
  });

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
            propertyType: inputsPropertyType,
            required: true,
          },
          { propertyType: getPropertyTypeId("step") },
          { propertyType: getPropertyTypeId("outputs") },
        ],
        outgoingLinks: [
          {
            linkEntityType: usesLinkEntityTypeId,
            destinationEntityTypes: [updatedFlowDefinitionEntityTypeId],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: triggeredByLinkEntityType,
            destinationEntityTypes: [flowTriggerEntityType],
            maxItems: 1,
          },
        ],
      }),
    });

  /**
   * Step 6: Update `Usage Record`, which can be incurred in a flow run, to link to the new `Flow Run` type.
   */
  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [updatedFlowRunEntityTypeId],
    dependentEntityTypeKeys: ["usageRecord"],
    migrationState,
  });

  /**
   * Step 7: Let anyone view the flow definitions in the `h` web, so that anyone can run or trigger the flows HASH
   * provides. One policy covers every flow definition seeded there, including the dev-only ones.
   */
  const hashOrg = await getOrgByShortname(context, authentication, {
    shortname: "h",
  });

  if (!hashOrg) {
    throw new Error(
      "Org with shortname 'h' does not exist, but is needed to seed flow definitions.",
    );
  }

  const publicViewPolicyName = "public-view-h-flow-definitions";

  const [existingPublicViewPolicy] = await queryPolicies(
    context.graphApi,
    authentication,
    { name: publicViewPolicyName, principal: { filter: "unconstrained" } },
  );

  if (!existingPublicViewPolicy) {
    await createPolicy(context.graphApi, authentication, {
      name: publicViewPolicyName,
      effect: "permit",
      principal: null,
      actions: ["viewEntity"],
      resource: {
        type: "entity",
        webId: hashOrg.webId,
        filter: {
          type: "isOfBaseType",
          entityType: systemEntityTypes.flowDefinition.entityTypeBaseUrl,
        },
      },
    });
  }

  /**
   * Step 8: Seed the flows HASH provided at the time of writing from this migration's snapshot,
   * so that runs and triggers can link to them and runs can load them.
   */
  await seedFlowDefinitions(context, authentication, {
    flows: await readFlowDefinitionSnapshot("032"),
    flowDefinitionEntityTypeId: updatedFlowDefinitionEntityTypeId,
  });

  return migrationState;
};

export default migrate;
