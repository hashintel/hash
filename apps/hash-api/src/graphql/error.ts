import { ApolloServerErrorCode } from "@apollo/server/errors";
import { GraphQLError } from "graphql";

export const code = (
  // eslint-disable-next-line @typescript-eslint/no-shadow
  code: string,
  message: string,
  extensions?: Record<string, unknown>,
) => new GraphQLError(message, { extensions: { code, ...extensions } });

export const badUserInput = (
  message: string,
  extensions?: Record<string, unknown>,
) => code(ApolloServerErrorCode.BAD_USER_INPUT, message, extensions);
export const forbidden = (
  message: string,
  extensions?: Record<string, unknown>,
) => code("FORBIDDEN", message, extensions);
export const notFound = (
  message: string,
  extensions?: Record<string, unknown>,
) => code("NOT_FOUND", message, extensions);
export const cyclicTree = (
  message: string,
  extensions?: Record<string, unknown>,
) => code("CYCLIC_TREE", message, extensions);
export const badRequest = (
  message: string,
  extensions?: Record<string, unknown>,
) => code(ApolloServerErrorCode.BAD_REQUEST, message, extensions);
export const invalidInvitationType = (
  message: string,
  extensions?: Record<string, unknown>,
) => code("INVALID_INVITATION_TYPE", message, extensions);
export const internal = (
  message: string,
  extensions?: Record<string, unknown>,
) => code(ApolloServerErrorCode.INTERNAL_SERVER_ERROR, message, extensions);
