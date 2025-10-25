import type {
  EntityTypeWithMetadata,
  OntologyTemporalMetadata,
  WebId,
} from "@blockprotocol/type-system";
import type { UserPermissionsOnEntityType } from "@local/hash-graph-sdk/authorization";
import type {
  GetClosedMultiEntityTypesResponse,
  QueryEntityTypesResponse,
  SerializedQueryEntityTypeSubgraphResponse,
} from "@local/hash-graph-sdk/entity-type";
import {
  getClosedMultiEntityTypes,
  queryEntityTypes,
  queryEntityTypeSubgraph,
  serializeQueryEntityTypeSubgraphResponse,
} from "@local/hash-graph-sdk/entity-type";

import {
  archiveEntityType,
  checkPermissionsOnEntityType,
  createEntityType,
  unarchiveEntityType,
  updateEntityType,
  updateEntityTypes,
} from "../../../graph/ontology/primitive/entity-type";
import type {
  MutationArchiveEntityTypeArgs,
  MutationCreateEntityTypeArgs,
  MutationUnarchiveEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  MutationUpdateEntityTypesArgs,
  QueryCheckUserPermissionsOnEntityTypeArgs,
  QueryGetClosedMultiEntityTypesArgs,
  QueryQueryEntityTypesArgs,
  QueryQueryEntityTypeSubgraphArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { graphQLContextToImpureGraphContext } from "../util";

export const createEntityTypeResolver: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, params, graphQLContext) => {
  const { authentication, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const { webId, entityType } = params;

  const createdEntityType = await createEntityType(context, authentication, {
    webId: webId ?? (user.accountId as WebId),
    schema: entityType,
  });

  return createdEntityType;
};

export const queryEntityTypesResolver: ResolverFn<
  Promise<QueryEntityTypesResponse>,
  Record<string, never>,
  GraphQLContext,
  QueryQueryEntityTypesArgs
> = async (_, { request }, graphQLContext) =>
  queryEntityTypes(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    request,
  );

export const queryEntityTypeSubgraphResolver: ResolverFn<
  Promise<SerializedQueryEntityTypeSubgraphResponse>,
  Record<string, never>,
  GraphQLContext,
  QueryQueryEntityTypeSubgraphArgs
> = async (_, { request }, graphQLContext) =>
  queryEntityTypeSubgraph(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    request,
  ).then(serializeQueryEntityTypeSubgraphResponse);

export const getClosedMultiEntityTypesResolver: ResolverFn<
  Promise<GetClosedMultiEntityTypesResponse>,
  Record<string, never>,
  GraphQLContext,
  QueryGetClosedMultiEntityTypesArgs
> = async (_, { request }, graphQLContext) =>
  getClosedMultiEntityTypes(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    request,
  );

export const updateEntityTypeResolver: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (_, params, graphQLContext) =>
  updateEntityType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      entityTypeId: params.entityTypeId,
      schema: params.updatedEntityType,
    },
  );

export const updateEntityTypesResolver: ResolverFn<
  Promise<EntityTypeWithMetadata[]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateEntityTypesArgs
> = async (_, params, graphQLContext) =>
  updateEntityTypes(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      entityTypeUpdates: params.updates.map((update) => ({
        entityTypeId: update.entityTypeId,
        schema: update.updatedEntityType,
        relationships: [
          {
            relation: "setting",
            subject: {
              kind: "setting",
              subjectId: "updateFromWeb",
            },
          },
          {
            relation: "viewer",
            subject: {
              kind: "public",
            },
          },
        ],
      })),
    },
  );

export const checkUserPermissionsOnEntityTypeResolver: ResolverFn<
  Promise<UserPermissionsOnEntityType>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryCheckUserPermissionsOnEntityTypeArgs
> = async (_, params, { dataSources, authentication, provenance }) =>
  checkPermissionsOnEntityType(
    { ...dataSources, provenance },
    authentication,
    params,
  );

export const archiveEntityTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveEntityTypeArgs
> = async (_, params, graphQLContext) =>
  archiveEntityType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );

export const unarchiveEntityTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUnarchiveEntityTypeArgs
> = async (_, params, graphQLContext) =>
  unarchiveEntityType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );
