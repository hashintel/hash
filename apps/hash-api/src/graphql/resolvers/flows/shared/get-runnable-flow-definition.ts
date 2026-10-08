import { getFlowType } from "@local/hash-isomorphic-utils/flows/get-flow-type";
import { assertValidFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import * as GraphQLError from "../../../error";

import type { LoggedInGraphQLContext } from "../../../context";

/**
 * Checks a flow definition given by the client, and that the user can run it.
 *
 * @throws a GraphQL error if the definition is invalid, or if it's an AI flow and the user can't run AI flows.
 */
export const getRunnableFlowDefinition = (
  graphQLContext: LoggedInGraphQLContext,
  flowDefinitionInput: unknown,
) => {
  const { user } = graphQLContext;

  let flowDefinition;

  try {
    flowDefinition = assertValidFlowDefinition(flowDefinitionInput);
  } catch (error) {
    throw GraphQLError.badRequest((error as Error).message);
  }

  const flowType = getFlowType(flowDefinition);

  if (flowType === "ai" && !user.enabledFeatureFlags.includes("ai")) {
    throw GraphQLError.forbidden("AI flows are not enabled for this user");
  }

  return { flowDefinition, flowType };
};
