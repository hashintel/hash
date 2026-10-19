import { CombinedGraphQLErrors } from "@apollo/client";

/**
 * A `.catch` handler for a `client.query` promise: resolves GraphQL errors to
 * `undefined`, so the caller can return them to the block as a Block Protocol
 * error, and rethrows any other error, such as a network failure.
 */
export const graphQLErrorsAsUndefined = (error: unknown): undefined => {
  if (CombinedGraphQLErrors.is(error)) {
    return undefined;
  }

  throw error;
};
