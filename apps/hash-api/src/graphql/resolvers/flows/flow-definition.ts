import { getFlowDefinitionEntityById } from "@local/hash-backend-utils/flows/shared/get-flow-definition-entity-by-id";
import { canConnect } from "@local/hash-isomorphic-utils/flows/can-connect";
import { mapInputsPropertyToFlowInputValues } from "@local/hash-isomorphic-utils/flows/mappings";
import {
  addStepIdsToDiagnostics,
  formatFlowDefinitionDiagnostics,
  validateFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import {
  createFlowDefinition as createFlowDefinitionEntity,
  getActiveFlowSchedulesOfFlowDefinition,
  updateFlowDefinition as updateFlowDefinitionEntity,
} from "../../../graph/knowledge/system-types/flow-definition";
import * as GraphQLError from "../../error";
import { graphQLContextToImpureGraphContext } from "../util";
import { pauseActiveFlowSchedule } from "./flow-schedule";

import type {
  Mutation,
  MutationArchiveFlowDefinitionArgs,
  MutationCreateFlowDefinitionArgs,
  MutationUpdateFlowDefinitionArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  FlowDefinition,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

/**
 * Checks a definition given to save. Only one without the shape of a definition is refused: anything else is saved
 * with its problems, so that a flow can be saved before it's finished.
 *
 * @throws a GraphQL bad request error if the definition doesn't have the shape of one, listing why.
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

/**
 * A flow definition the user can view, which they can then try to change: the graph checks they may.
 *
 * @throws a GraphQL not found error if it doesn't exist or the user can't view it.
 */
const getFlowDefinitionEntity = async (
  graphQLContext: LoggedInGraphQLContext,
  flowDefinitionEntityId: EntityId,
) => {
  const entity = await getFlowDefinitionEntityById({
    flowDefinitionEntityId,
    graphApiClient: graphQLContext.dataSources.graphApi,
    userAuthentication: graphQLContext.authentication,
  });

  if (!entity) {
    throw GraphQLError.notFound(
      `No flow definition with id ${flowDefinitionEntityId} exists, or you can't view it`,
    );
  }

  return entity;
};

/**
 * Why the values a trigger gives a flow's inputs wouldn't fill the inputs of a definition, checked with the rule that
 * connections in a definition follow, as each value can feed its input. Empty if they would.
 */
const getFlowInputsProblems = ({
  flowDefinition,
  flowInputs,
}: {
  flowDefinition: FlowDefinition<string>;
  flowInputs: FlowInputValues;
}): string[] => {
  const problems: string[] = [];

  for (const input of flowDefinition.inputs) {
    const payload = flowInputs[input.name];

    if (!payload) {
      if (input.required) {
        problems.push(
          `it gives no value for the required input "${input.name}"`,
        );
      }
      continue;
    }

    const check = canConnect({
      source: {
        payloadKind: payload.kind,
        array: Array.isArray(payload.value),
        required: true,
      },
      target: {
        oneOfPayloadKinds: [input.payloadKind],
        array: input.array,
        required: input.required,
      },
    });

    if (!check.ok) {
      problems.push(`its value for input "${input.name}": ${check.message}`);
    }
  }

  for (const inputName of Object.keys(flowInputs)) {
    if (!flowDefinition.inputs.some(({ name }) => name === inputName)) {
      problems.push(
        `it gives a value for "${inputName}", which isn't an input`,
      );
    }
  }

  return problems;
};

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

  const scheduleProblems = activeSchedules.flatMap((schedule) => {
    const { name, inputs } = simplifyProperties(schedule.properties);

    const problems = checked.isRunnable
      ? getFlowInputsProblems({
          flowDefinition: checked.flowDefinition,
          flowInputs: inputs ? mapInputsPropertyToFlowInputValues(inputs) : {},
        })
      : ["the flow wouldn't be valid"];

    return problems.map((problem) => `- schedule "${name}": ${problem}`);
  });

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

  const activeSchedules = await getActiveFlowSchedulesOfFlowDefinition(
    context,
    authentication,
    { flowDefinitionEntityId },
  );

  /* Paused rather than archived, so that they can be resumed if the flow is restored. */
  await Promise.all(
    activeSchedules.map((schedule) =>
      pauseActiveFlowSchedule(graphQLContext, {
        schedule,
        note: "Its flow was archived",
      }),
    ),
  );

  await entity.archive(context.graphApi, authentication, context.provenance);

  return true;
};
