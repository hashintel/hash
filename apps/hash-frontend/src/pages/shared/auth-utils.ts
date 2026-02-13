import type { GraphQLError } from "graphql";

export const SYNTHETIC_LOADING_TIME_MS = 700;

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
