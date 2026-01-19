import {
  type EntityId,
  type EntityUuid,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";
import type {
  CreateFlowScheduleInput,
  ScheduleSpec,
  UpdateFlowScheduleInput,
} from "@local/hash-isomorphic-utils/flows/schedule-types";
import {
  defaultScheduleCatchupWindowMs,
  scheduleSpecToTemporalSpec,
} from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { ScheduleOverlapPolicy } from "@temporalio/client";

import {
  createFlowSchedule as createFlowScheduleEntity,
  pauseFlowSchedule as pauseFlowScheduleEntity,
  resumeFlowSchedule as resumeFlowScheduleEntity,
  updateFlowSchedule as updateFlowScheduleEntity,
  type FlowScheduleEntity,
} from "../../../graph/knowledge/system-types/flow-schedule";
import type { ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import * as GraphQLError from "../../error";
import { graphQLContextToImpureGraphContext } from "../util";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/shared";

/**
 * Generates a unique schedule ID for Temporal based on the entity UUID.
 */
const getTemporalScheduleId = (scheduleEntityId: EntityUuid): string =>
  `flow-schedule-${scheduleEntityId}`;

/**
 * Maps our overlap policy string to Temporal's ScheduleOverlapPolicy enum.
 */
const mapOverlapPolicy = (policy: string): ScheduleOverlapPolicy => {
  const policyMap: Record<string, ScheduleOverlapPolicy> = {
    SKIP: "SCHEDULE_OVERLAP_POLICY_SKIP" as ScheduleOverlapPolicy,
    BUFFER_ONE: "SCHEDULE_OVERLAP_POLICY_BUFFER_ONE" as ScheduleOverlapPolicy,
    ALLOW_ALL: "SCHEDULE_OVERLAP_POLICY_ALLOW_ALL" as ScheduleOverlapPolicy,
    CANCEL_OTHER:
      "SCHEDULE_OVERLAP_POLICY_CANCEL_OTHER" as ScheduleOverlapPolicy,
  };
  return (
    policyMap[policy] ??
    ("SCHEDULE_OVERLAP_POLICY_SKIP" as ScheduleOverlapPolicy)
  );
};

export const createFlowScheduleResolver: ResolverFn<
  Promise<HashEntity<FlowSchedule>>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { input: CreateFlowScheduleInput }
> = async (_, { input }, graphQLContext) => {
  const { temporal, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  // Validate flow type permissions
  if (input.flowType === "ai" && !user.enabledFeatureFlags.includes("ai")) {
    throw GraphQLError.forbidden("AI flows are not enabled for this user");
  }

  // Validate data sources for AI flows
  if (input.flowType === "ai" && !input.dataSources) {
    throw GraphQLError.badRequest("Data sources are required for AI flows");
  }

  // Create the schedule entity in the database
  const schedule = await createFlowScheduleEntity(
    context,
    authentication,
    input,
  );

  // Extract properties for Temporal schedule creation
  const props = simplifyProperties(schedule.properties);
  const scheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );

  // Create the Temporal schedule
  const temporalScheduleId = getTemporalScheduleId(scheduleId);
  const taskQueue = input.flowType;

  const workflowParams: RunFlowWorkflowParams = {
    ...(input.flowType === "ai" && input.dataSources
      ? { dataSources: input.dataSources }
      : {}),
    flowTrigger: input.flowTrigger,
    flowDefinition: {
      flowDefinitionId: input.flowDefinitionId,
      type: input.flowType,
      name: input.name,
      description: "",
      trigger: {
        kind: "scheduled",
        description: "Scheduled trigger",
        triggerDefinitionId: "scheduledTrigger",
        active: true,
        cronSchedule: "",
      },
      steps: [],
      outputs: [],
    },
    userAuthentication: { actorId: user.accountId },
    webId: input.webId,
  };

  try {
    await temporal.schedule.create({
      scheduleId: temporalScheduleId,
      spec: scheduleSpecToTemporalSpec(input.scheduleSpec),
      action: {
        type: "startWorkflow",
        workflowType: "runFlow",
        taskQueue,
        args: [workflowParams],
        memo: {
          flowDefinitionId: input.flowDefinitionId,
          flowScheduleId: scheduleId,
          userAccountId: user.accountId,
          webId: input.webId,
        },
      },
      policies: {
        overlap: mapOverlapPolicy(props.scheduleOverlapPolicy),
        catchupWindow:
          typeof props.scheduleCatchupWindow === "number"
            ? props.scheduleCatchupWindow
            : defaultScheduleCatchupWindowMs,
        pauseOnFailure: props.pauseOnFailure ?? false,
      },
    });
  } catch (err) {
    // If Temporal schedule creation fails, we should ideally roll back the entity
    // For now, log the error and throw
    const message = err instanceof globalThis.Error ? err.message : String(err);
    throw GraphQLError.internal(
      `Failed to create Temporal schedule: ${message}`,
    );
  }

  return schedule;
};

export const updateFlowScheduleResolver: ResolverFn<
  Promise<FlowScheduleEntity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { input: UpdateFlowScheduleInput }
> = async (_, { input }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  // Update the entity in the database
  const schedule = await updateFlowScheduleEntity(
    context,
    authentication,
    input,
  );

  // Update the Temporal schedule if relevant fields changed
  const scheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );
  const temporalScheduleId = getTemporalScheduleId(scheduleId);

  try {
    const handle = temporal.schedule.getHandle(temporalScheduleId);

    // Update schedule spec if changed
    if (input.scheduleSpec) {
      await handle.update((prev) => ({
        ...prev,
        spec: scheduleSpecToTemporalSpec(input.scheduleSpec as ScheduleSpec),
      }));
    }

    // Update policies if changed
    if (
      input.overlapPolicy ??
      input.catchupWindowMs ??
      input.pauseOnFailure !== undefined
    ) {
      await handle.update((prev) => ({
        ...prev,
        policies: {
          ...prev.policies,
          ...(input.overlapPolicy
            ? { overlap: mapOverlapPolicy(input.overlapPolicy) }
            : {}),
          ...(input.catchupWindowMs
            ? { catchupWindow: input.catchupWindowMs }
            : {}),
          ...(input.pauseOnFailure !== undefined
            ? { pauseOnFailure: input.pauseOnFailure }
            : {}),
        },
      }));
    }
  } catch (err) {
    // Log but don't fail if Temporal update fails - the entity is already updated
    // eslint-disable-next-line no-console
    console.error(
      `Failed to update Temporal schedule ${temporalScheduleId}:`,
      err,
    );
  }

  return schedule;
};

export const pauseFlowScheduleResolver: ResolverFn<
  Promise<FlowScheduleEntity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { scheduleId: string; note?: string | null }
> = async (_, { scheduleId, note }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  // Pause the entity in the database
  const schedule = await pauseFlowScheduleEntity(context, authentication, {
    scheduleEntityId: scheduleId as EntityId,
    note: note ?? undefined,
  });

  // Pause the Temporal schedule
  const entityScheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );
  const temporalScheduleId = getTemporalScheduleId(entityScheduleId);

  try {
    const handle = temporal.schedule.getHandle(temporalScheduleId);
    await handle.pause(note ?? undefined);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to pause Temporal schedule ${temporalScheduleId}:`,
      err,
    );
  }

  return schedule;
};

export const resumeFlowScheduleResolver: ResolverFn<
  Promise<FlowScheduleEntity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { scheduleId: string }
> = async (_, { scheduleId }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  // Resume the entity in the database
  const schedule = await resumeFlowScheduleEntity(context, authentication, {
    scheduleEntityId: scheduleId as EntityId,
  });

  // Resume the Temporal schedule
  const entityScheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );
  const temporalScheduleId = getTemporalScheduleId(entityScheduleId);

  try {
    const handle = temporal.schedule.getHandle(temporalScheduleId);
    await handle.unpause();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to resume Temporal schedule ${temporalScheduleId}:`,
      err,
    );
  }

  return schedule;
};

export const archiveFlowScheduleResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  { scheduleId: string }
> = async (_, { scheduleId }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  // Get the schedule to find the Temporal schedule ID
  const schedule = await getFlowScheduleEntityById(context, authentication, {
    scheduleEntityId: scheduleId,
  });

  // Delete the Temporal schedule
  const entityScheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );
  const temporalScheduleId = getTemporalScheduleId(entityScheduleId);

  try {
    const handle = temporal.schedule.getHandle(temporalScheduleId);
    await handle.delete();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to delete Temporal schedule ${temporalScheduleId}:`,
      err,
    );
  }

  await schedule.archive(context.graphApi, authentication, context.provenance);

  return true;
};
