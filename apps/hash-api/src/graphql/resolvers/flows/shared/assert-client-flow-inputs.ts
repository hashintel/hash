import { assertNoStoredPayloadRefsInFlowInputs } from "@local/hash-isomorphic-utils/flows/stored-payload-refs";

import * as GraphQLError from "../../../error";

import type { FlowInputValues } from "@local/hash-isomorphic-utils/flows/types";

/**
 * Checks flow inputs given by the client.
 *
 * @throws a GraphQL bad request error if an input holds a stored payload reference, which only a flow's own steps
 *   can create.
 */
export const assertClientFlowInputs = (flowInputs: FlowInputValues) => {
  try {
    assertNoStoredPayloadRefsInFlowInputs(flowInputs);
  } catch (error) {
    throw GraphQLError.badRequest((error as Error).message);
  }
};
