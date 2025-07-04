/**
 * @todo H-2421: Check this file for redundancy after implementing email verification.
 */

import type { ParsedUrlQueryInput } from "node:querystring";

import type { GraphQLError } from "graphql";

export const SYNTHETIC_LOADING_TIME_MS = 700;

type ParsedAuthQuery = {
  verificationId: string;
  verificationCode: string;
};

export const isParsedAuthQuery = (
  query: ParsedUrlQueryInput,
): query is ParsedAuthQuery =>
  typeof query.verificationId === "string" &&
  typeof query.verificationCode === "string";

export const parseGraphQLError = (
  errors: GraphQLError[],
  priorityErrorCode?: string,
): { errorCode: string; message: string } => {
  const priorityError = errors.find(
    ({ extensions }) => extensions.code === priorityErrorCode,
  );

  if (priorityError) {
    return {
      errorCode: priorityError.extensions.code as string,
      message: priorityError.message,
    };
  }

  return {
    errorCode: errors[0]!.extensions.code as string,
    message: errors[0]!.message,
  };
};
