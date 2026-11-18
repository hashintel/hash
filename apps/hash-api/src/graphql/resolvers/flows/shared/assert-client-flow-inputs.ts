import {
  omitInvalidEmptyFlowInputs,
  validateFlowInputs,
} from "@local/hash-isomorphic-utils/flows/validate-payloads";

import * as GraphQLError from "../../../error";

import type {
  FlowDefinition,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * Checks flow inputs given by the client against the inputs of the flow they're for, so that a request with invalid
 * inputs fails when it's made, rather than when its run starts.
 *
 * @throws a GraphQL bad request error naming the first invalid input, and where in its value the problem is.
 */
export const assertClientFlowInputs = ({
  flowDefinition,
  flowInputs,
}: {
  flowDefinition: Pick<FlowDefinition, "inputs">;
  flowInputs: FlowInputValues;
}) => {
  const invalidFlowInputMessage = validateFlowInputs({
    inputDefinitions: flowDefinition.inputs,
    /* As the run does, so that an input left blank in a form counts as not given. */
    flowInputs: omitInvalidEmptyFlowInputs({
      inputDefinitions: flowDefinition.inputs,
      flowInputs,
    }),
  });

  if (invalidFlowInputMessage) {
    throw GraphQLError.badRequest(invalidFlowInputMessage);
  }
};
