import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "@local/hash-graph-sdk/api-token";

import type {
  Mutation,
  MutationCreateApiTokenArgs,
  MutationRevokeApiTokenArgs,
  Query,
  ResolverFn,
} from "../api-types.gen";
import type { LoggedInGraphQLContext } from "../context";

export const myApiTokensResolver: ResolverFn<
  Query["myApiTokens"],
  Record<string, never>,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (_, _args, graphQLContext) =>
  listApiTokens(
    graphQLContext.dataSources.graphApi,
    graphQLContext.authentication,
  );

export const createApiTokenResolver: ResolverFn<
  Mutation["createApiToken"],
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateApiTokenArgs
> = async (_, { name, lifetimeDays }, graphQLContext) =>
  createApiToken(
    graphQLContext.dataSources.graphApi,
    graphQLContext.authentication,
    { name, lifetimeDays },
  );

export const revokeApiTokenResolver: ResolverFn<
  Mutation["revokeApiToken"],
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationRevokeApiTokenArgs
> = async (_, { tokenId }, graphQLContext) => {
  await revokeApiToken(
    graphQLContext.dataSources.graphApi,
    graphQLContext.authentication,
    tokenId,
  );

  return tokenId;
};
