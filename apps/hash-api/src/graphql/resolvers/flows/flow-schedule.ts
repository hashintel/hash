import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import {
  defaultScheduleCatchupWindowMs,
  scheduleSpecToTemporalSpec,
} from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/shared";

import {
  createFlowSchedule as createFlowScheduleEntity,
  getFlowScheduleById as getFlowScheduleEntityById,
  pauseFlowSchedule as pauseFlowScheduleEntity,
  resumeFlowSchedule as resumeFlowScheduleEntity,
  updateFlowSchedule as updateFlowScheduleEntity,
} from "../../../graph/knowledge/system-types/flow-schedule";
import type {
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
  Promise<HashEntity<FlowSchedule>>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateFlowScheduleArgs
> = async (_, { input }, graphQLContext) => {
  const { temporal, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const { flowType } = input;

  if (input.flowType === "ai" && !user.enabledFeatureFlags.includes("ai")) {
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
    flowTrigger: input.flowTrigger,
    flowDefinition: {
      flowDefinitionId: input.flowDefinitionId,
      type: flowType,
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
      scheduleId,
      spec: scheduleSpecToTemporalSpec(input.scheduleSpec),
      action: {
        type: "startWorkflow",
        workflowType: "runFlow",
        taskQueue,
        args: [workflowParams],
        memo: {
          flowDefinitionId: input.flowDefinitionId,
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
  Promise<HashEntity<FlowSchedule>>,
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
          ...(input.overlapPolicy ? { overlap: input.overlapPolicy } : {}),
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
    console.error(`Failed to update Temporal schedule ${scheduleId}:`, err);
  }

  return schedule;
};

export const pauseFlowScheduleResolver: ResolverFn<
  Promise<HashEntity<FlowSchedule>>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationPauseFlowScheduleArgs
> = async (_, { scheduleEntityId, note }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  // Pause the entity in the database
  const schedule = await pauseFlowScheduleEntity(context, authentication, {
    scheduleEntityId,
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
    // eslint-disable-next-line no-console
    console.error(`Failed to pause Temporal schedule ${scheduleId}:`, err);
  }

  return schedule;
};

export const resumeFlowScheduleResolver: ResolverFn<
  Promise<HashEntity<FlowSchedule>>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationResumeFlowScheduleArgs
> = async (_, { scheduleEntityId }, graphQLContext) => {
  const { temporal } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  // Resume the entity in the database
  const schedule = await resumeFlowScheduleEntity(context, authentication, {
    scheduleEntityId,
  });

  // Resume the Temporal schedule
  const scheduleId = extractEntityUuidFromEntityId(
    schedule.metadata.recordId.entityId,
  );

  try {
    const handle = temporal.schedule.getHandle(scheduleId);
    await handle.unpause();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to resume Temporal schedule ${scheduleId}:`, err);
  }

  return schedule;
};

export const archiveFlowScheduleResolver: ResolverFn<
  Promise<boolean>,
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
    // eslint-disable-next-line no-console
    console.error(`Failed to delete Temporal schedule ${scheduleId}:`, err);
  }

  await schedule.archive(context.graphApi, authentication, context.provenance);

  return true;
};
