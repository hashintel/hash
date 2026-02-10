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
  const extractErrorCode = (error: GraphQLError) =>
    typeof error.extensions.code === "string"
      ? error.extensions.code
      : "unknown";

  if (errors.length === 0) {
    return {
      errorCode: "unknown",
      message: "An unexpected error occurred.",
    };
  }

  const priorityError = priorityErrorCode
    ? errors.find(({ extensions }) => extensions.code === priorityErrorCode)
    : undefined;

  if (priorityError) {
    return {
      errorCode: extractErrorCode(priorityError),
      message: priorityError.message,
    };
  }

  const firstError = errors[0]!;

  return {
    errorCode: extractErrorCode(firstError),
    message: firstError.message,
  };
};
