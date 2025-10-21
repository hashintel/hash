import { ApolloServerErrorCode } from "@apollo/server/dist/esm/errors";
import { GraphQLError } from "graphql";

export const any = (message: string, extensions?: Record<string, unknown>) =>
  new GraphQLError(message, { extensions });
export const code = (
  // eslint-disable-next-line @typescript-eslint/no-shadow
  code: string,
  message: string,
  extensions?: Record<string, unknown>,
) => any(message, { code, ...extensions });

export const badUserInput = (
  message: string,
  extensions?: Record<string, unknown>,
) => code(message, ApolloServerErrorCode.BAD_USER_INPUT, extensions);
export const forbidden = (
  message: string,
  extensions?: Record<string, unknown>,
) => code(message, "FORBIDDEN", extensions);
export const notFound = (
  message: string,
  extensions?: Record<string, unknown>,
) => code(message, "NOT_FOUND", extensions);
export const internal = (
  message: string,
  extensions?: Record<string, unknown>,
) => code(message, ApolloServerErrorCode.INTERNAL_SERVER_ERROR, extensions);
