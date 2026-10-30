import {
  addStepIdsToDiagnostics,
  formatFlowDefinitionDiagnostics,
  validateFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { checkEntityPermission } from "../../../graph/knowledge/primitive/entity";
import {
  createFlowDefinition as createFlowDefinitionEntity,
  getActiveFlowSchedulesOfFlowDefinition,
  updateFlowDefinition as updateFlowDefinitionEntity,
} from "../../../graph/knowledge/system-types/flow-definition";
import * as GraphQLError from "../../error";
import { graphQLContextToImpureGraphContext } from "../util";
import {
  pauseActiveFlowSchedule,
  resumePausedFlowSchedule,
} from "./flow-schedule";
import {
  getFlowScheduleProblems,
  getScheduledFlowRun,
} from "./shared/get-flow-schedule-problems";
import { getFlowDefinitionEntity } from "./shared/get-runnable-flow-definition";

import type {
  Mutation,
  MutationArchiveFlowDefinitionArgs,
  MutationCreateFlowDefinitionArgs,
  MutationUpdateFlowDefinitionArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

/**
 * Checks a definition to save. Anything with the shape of a definition is saved with its problems, so that a flow can
 * be saved before it's finished.
 *
 * @throws a GraphQL bad request error, listing why, if the definition doesn't have the shape of one.
 */
const checkDefinitionToSave = (definition: unknown) => {
  const { flowDefinition, diagnostics } = validateFlowDefinition(definition);

  if (!flowDefinition) {
    throw GraphQLError.badRequest(
      `The flow definition can't be saved, because it doesn't have the shape of one:\n${formatFlowDefinitionDiagnostics(diagnostics)}`,
    );
  }

  return {
    flowDefinition,
    diagnostics: addStepIdsToDiagnostics(flowDefinition, diagnostics),
    isRunnable: !diagnostics.some(({ severity }) => severity === "error"),
  };
};

const toSaveResult = (
  entity: HashEntity<FlowDefinitionEntity>,
  checked: ReturnType<typeof checkDefinitionToSave>,
): Mutation["createFlowDefinition"] => ({
  flowDefinitionEntityId: entity.metadata.recordId.entityId,
  editionId: entity.metadata.recordId.editionId,
  diagnostics: checked.diagnostics,
  isRunnable: checked.isRunnable,
});

export const createFlowDefinitionResolver: ResolverFn<
  Promise<Mutation["createFlowDefinition"]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateFlowDefinitionArgs
> = async (_, { webId, definition }, graphQLContext) => {
  const checked = checkDefinitionToSave(definition);

  const entity = await createFlowDefinitionEntity(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    { webId, flowDefinition: checked.flowDefinition },
  );

  return toSaveResult(entity, checked);
};

export const updateFlowDefinitionResolver: ResolverFn<
  Promise<Mutation["updateFlowDefinition"]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateFlowDefinitionArgs
> = async (
  _,
  { flowDefinitionEntityId, expectedEditionId, definition },
  graphQLContext,
) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const checked = checkDefinitionToSave(definition);

  const entity = await getFlowDefinitionEntity(
    graphQLContext,
    flowDefinitionEntityId,
  );

  if (entity.metadata.archived) {
    throw GraphQLError.badRequest("This flow has been archived");
  }

  /*
   * The graph can't make a write depend on the current edition, so another save can still land between this check
   * and the update. It catches an editor working from a definition that someone has changed since it loaded it.
   */
  if (entity.metadata.recordId.editionId !== expectedEditionId) {
    throw GraphQLError.code(
      "CONFLICT",
      "This flow has changed since it was loaded. Load it again to make your changes to the latest version.",
    );
  }

  const activeSchedules = await getActiveFlowSchedulesOfFlowDefinition(
    context,
    authentication,
    { flowDefinitionEntityId },
  );

  const scheduleProblems = (
    await Promise.all(
      activeSchedules.map(async (schedule) => {
        const { name } = simplifyProperties(schedule.properties);

        const problems = checked.isRunnable
          ? getFlowScheduleProblems({
              flowDefinition: checked.flowDefinition,
              schedule,
              scheduledFlowType: (
                await getScheduledFlowRun(graphQLContext, schedule)
              ).taskQueue,
            })
          : ["the flow wouldn't be valid"];

        return problems.map((problem) => `- schedule "${name}": ${problem}`);
      }),
    )
  ).flat();

  if (scheduleProblems.length > 0) {
    throw GraphQLError.badRequest(
      `This change would stop the flow's active schedules from running it. Pause them first to make it.\n${scheduleProblems.join("\n")}`,
    );
  }

  const updatedEntity = await updateFlowDefinitionEntity(
    context,
    authentication,
    { entity, flowDefinition: checked.flowDefinition },
  );

  return toSaveResult(updatedEntity, checked);
};

export const archiveFlowDefinitionResolver: ResolverFn<
  Promise<Mutation["archiveFlowDefinition"]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveFlowDefinitionArgs
> = async (_, { flowDefinitionEntityId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const entity = await getFlowDefinitionEntity(
    graphQLContext,
    flowDefinitionEntityId,
  );

  if (entity.metadata.archived) {
    return true;
  }

  const canArchive = await checkEntityPermission(context, authentication, {
    entityId: flowDefinitionEntityId,
    permission: "archiveEntity",
  });

  if (!canArchive) {
    throw GraphQLError.forbidden(
      "You don't have permission to archive this flow",
    );
  }

  const activeSchedules = await getActiveFlowSchedulesOfFlowDefinition(
    context,
    authentication,
    { flowDefinitionEntityId },
  );

  /* Paused rather than archived, so that they can be resumed if the flow is restored. */
  const pauses = await Promise.allSettled(
    activeSchedules.map((schedule) =>
      pauseActiveFlowSchedule(graphQLContext, {
        schedule,
        note: "Its flow was archived",
      }),
    ),
  );

  const pausedSchedules = pauses.flatMap((pause) =>
    pause.status === "fulfilled" ? [pause.value] : [],
  );

  /* Leaves the flow's schedules as they were if it isn't archived. */
  const failAndResumePausedSchedules = async (error: unknown) => {
    await Promise.allSettled(
      pausedSchedules.map((schedule) =>
        resumePausedFlowSchedule(graphQLContext, { schedule }),
      ),
    );

    throw error;
  };

  const failedPause = pauses.find((pause) => pause.status === "rejected");

  if (failedPause) {
    return failAndResumePausedSchedules(failedPause.reason);
  }

  try {
    await entity.archive(context.graphApi, authentication, context.provenance);
  } catch (error) {
    return failAndResumePausedSchedules(error);
  }

  return true;
};
