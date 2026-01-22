import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import {
  defaultScheduleCatchupWindowMs,
  scheduleSpecToTemporalSpec,
} from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import {
  createFlowSchedule as createFlowScheduleEntity,
  getFlowScheduleById as getFlowScheduleEntityById,
  pauseFlowSchedule as pauseFlowScheduleEntity,
  resumeFlowSchedule as resumeFlowScheduleEntity,
  revertFlowSchedulePause,
  revertFlowScheduleResume,
  updateFlowSchedule as updateFlowScheduleEntity,
} from "../../../graph/knowledge/system-types/flow-schedule";
import type {
  Mutation,
  MutationArchiveFlowScheduleArgs,
  MutationCreateFlowScheduleArgs,
  MutationPauseFlowScheduleArgs,
  MutationResumeFlowScheduleArgs,
  MutationUpdateFlowScheduleArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import * as GraphQLError from "../../error";
import { graphQLContextToImpureGraphContext } from "../util";

export const createFlowScheduleResolver: ResolverFn<
  Promise<Mutation["createFlowSchedule"]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateFlowScheduleArgs
> = async (_, { input }, graphQLContext) => {
  const { temporal, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const { flowDefinition } = input;
  const flowType = flowDefinition.type;

  if (flowType === "ai" && !user.enabledFeatureFlags.includes("ai")) {
    throw GraphQLError.forbidden("AI flows are not enabled for this user");
  }

  if (flowType === "ai" && !input.dataSources) {
    throw GraphQLError.badRequest("Data sources are required for AI flows");
  }

  const schedule = await createFlowScheduleEntity(
    context,
    authentication,
    input,
  );

  const props = simplifyProperties(schedule.properties);
  const scheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );

  const taskQueue = flowType;

  const workflowParams: RunFlowWorkflowParams = {
    ...(flowType === "ai" && input.dataSources
      ? { dataSources: input.dataSources }
      : {}),
    flowDefinition,
    flowRunName: input.name,
    flowTrigger: input.flowTrigger,
    userAuthentication: { actorId: user.accountId },
    webId: input.webId,
  };

  try {
    await temporal.schedule.create({
      scheduleId,
      spec: scheduleSpecToTemporalSpec(input.scheduleSpec),
      action: {
        type: "startWorkflow",
        workflowType: "runFlow",
        taskQueue,
        args: [workflowParams],
        memo: {
          flowDefinitionId: flowDefinition.flowDefinitionId,
          userAccountId: user.accountId,
          webId: input.webId,
        },
      },
      policies: {
        overlap: props.scheduleOverlapPolicy,
        catchupWindow:
          typeof props.scheduleCatchupWindow === "number"
            ? props.scheduleCatchupWindow
            : defaultScheduleCatchupWindowMs,
        pauseOnFailure: props.pauseOnFailure ?? false,
      },
      state: {
        triggerImmediately: input.triggerImmediately,
      },
    });
  } catch (err) {
    await schedule.archive(
      context.graphApi,
      authentication,
      context.provenance,
    );

    const message = err instanceof Error ? err.message : String(err);
    throw GraphQLError.internal(
      `Failed to create Temporal schedule: ${message}`,
    );
  }

  return scheduleId;
};

export const updateFlowScheduleResolver: ResolverFn<
  Promise<Mutation["updateFlowSchedule"]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateFlowScheduleArgs
> = async (_, { scheduleEntityId, input }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  // Update the entity in the database
  const schedule = await updateFlowScheduleEntity(context, authentication, {
    scheduleEntityId,
    input,
  });

  // Update the Temporal schedule if relevant fields changed
  const scheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );

  try {
    const handle = temporal.schedule.getHandle(scheduleId);

    // Update schedule spec if changed
    if (input.scheduleSpec) {
      await handle.update((prev) => ({
        ...prev,
        spec: scheduleSpecToTemporalSpec(input.scheduleSpec!),
      }));
    }

    // Update policies if changed
    if (
      input.overlapPolicy !== undefined ||
      input.catchupWindowMs !== undefined ||
      input.pauseOnFailure !== undefined
    ) {
      await handle.update((prev) => ({
        ...prev,
        policies: {
          ...prev.policies,
          ...(input.overlapPolicy ? { overlap: input.overlapPolicy } : {}),
          ...(typeof input.catchupWindowMs === "number"
            ? { catchupWindow: input.catchupWindowMs }
            : {}),
          ...(input.pauseOnFailure !== undefined
            ? { pauseOnFailure: input.pauseOnFailure }
            : {}),
        },
      }));
    }
  } catch (err) {
    throw GraphQLError.internal(
      `Failed to update Temporal schedule for schedule entity ${scheduleEntityId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return true;
};

export const pauseFlowScheduleResolver: ResolverFn<
  Promise<Mutation["pauseFlowSchedule"]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationPauseFlowScheduleArgs
> = async (_, { scheduleEntityId, note }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const existingSchedule = await getFlowScheduleEntityById(
    context,
    authentication,
    { scheduleEntityId },
  );

  const { scheduleStatus } = simplifyProperties(existingSchedule.properties);

  if (scheduleStatus === "paused") {
    return true;
  }

  const schedule = await pauseFlowScheduleEntity(context, authentication, {
    existingEntity: existingSchedule,
    note: note ?? undefined,
  });

  // Pause the Temporal schedule
  const scheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );

  try {
    const handle = temporal.schedule.getHandle(scheduleId);
    await handle.pause(note ?? undefined);
  } catch (err) {
    await revertFlowSchedulePause(context, authentication, {
      pausedEntity: schedule,
    });

    throw GraphQLError.internal(
      `Failed to pause Temporal schedule for schedule entity ${scheduleEntityId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return true;
};

export const resumeFlowScheduleResolver: ResolverFn<
  Promise<Mutation["resumeFlowSchedule"]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationResumeFlowScheduleArgs
> = async (_, { scheduleEntityId }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const existingSchedule = await getFlowScheduleEntityById(
    context,
    authentication,
    { scheduleEntityId },
  );

  const { scheduleStatus, schedulePauseState } = simplifyProperties(
    existingSchedule.properties,
  );

  if (scheduleStatus === "active") {
    return true;
  }

  const schedule = await resumeFlowScheduleEntity(context, authentication, {
    existingEntity: existingSchedule,
    hasSchedulePauseState: schedulePauseState !== undefined,
  });

  // Resume the Temporal schedule
  const scheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );

  try {
    const handle = temporal.schedule.getHandle(scheduleId);
    await handle.unpause();
  } catch (err) {
    // Revert the entity update if Temporal operation fails
    await revertFlowScheduleResume(context, authentication, {
      resumedEntity: schedule,
      previousPauseState: schedulePauseState,
    });

    throw GraphQLError.internal(
      `Failed to resume Temporal schedule for schedule entity ${scheduleEntityId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return true;
};

export const archiveFlowScheduleResolver: ResolverFn<
  Promise<Mutation["archiveFlowSchedule"]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveFlowScheduleArgs
> = async (_, { scheduleEntityId }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const schedule = await getFlowScheduleEntityById(context, authentication, {
    scheduleEntityId,
  });

  const scheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );

  try {
    const handle = temporal.schedule.getHandle(scheduleId);
    await handle.delete();
  } catch (err) {
    throw GraphQLError.internal(
      `Failed to delete Temporal schedule for schedule entity ${scheduleEntityId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await schedule.archive(context.graphApi, authentication, context.provenance);

  return true;
};
