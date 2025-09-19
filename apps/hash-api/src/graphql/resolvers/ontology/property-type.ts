import type {
  OntologyTemporalMetadata,
  PropertyTypeWithMetadata,
  WebId,
} from "@blockprotocol/type-system";
import {
  queryPropertyTypes,
  type QueryPropertyTypesResponse,
  queryPropertyTypeSubgraph,
  type SerializedQueryPropertyTypeSubgraphResponse,
  serializeQueryPropertyTypeSubgraphResponse,
} from "@local/hash-graph-sdk/property-type";

import {
  archivePropertyType,
  createPropertyType,
  unarchivePropertyType,
  updatePropertyType,
} from "../../../graph/ontology/primitive/property-type";
import type {
  MutationArchivePropertyTypeArgs,
  MutationCreatePropertyTypeArgs,
  MutationUnarchivePropertyTypeArgs,
  MutationUpdatePropertyTypeArgs,
  QueryQueryPropertyTypesArgs,
  QueryQueryPropertyTypeSubgraphArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { graphQLContextToImpureGraphContext } from "../util";

export const createPropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreatePropertyTypeArgs
> = async (_, params, graphQLContext) => {
  const { authentication, user } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const { webId, propertyType } = params;

  const createdPropertyType = await createPropertyType(
    context,
    authentication,
    {
      webId: (webId ?? user.accountId) as WebId,
      schema: propertyType,
    },
  );

  return createdPropertyType;
};

export const queryPropertyTypesResolver: ResolverFn<
  Promise<QueryPropertyTypesResponse>,
  Record<string, never>,
  GraphQLContext,
  QueryQueryPropertyTypesArgs
> = async (_, { request }, graphQLContext) =>
  queryPropertyTypes(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    request,
  );

export const queryPropertyTypeSubgraphResolver: ResolverFn<
  Promise<SerializedQueryPropertyTypeSubgraphResponse>,
  Record<string, never>,
  GraphQLContext,
  QueryQueryPropertyTypeSubgraphArgs
> = async (_, { request }, graphQLContext) =>
  queryPropertyTypeSubgraph(
    graphQLContextToImpureGraphContext(graphQLContext).graphApi,
    graphQLContext.authentication,
    request,
  ).then(serializeQueryPropertyTypeSubgraphResponse);

export const updatePropertyTypeResolver: ResolverFn<
  Promise<PropertyTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdatePropertyTypeArgs
> = async (_, params, graphQLContext) =>
  updatePropertyType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      propertyTypeId: params.propertyTypeId,
      schema: params.updatedPropertyType,
    },
  );

export const archivePropertyTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchivePropertyTypeArgs
> = async (_, params, graphQLContext) =>
  archivePropertyType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );

export const unarchivePropertyTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUnarchivePropertyTypeArgs
> = async (_, params, graphQLContext) =>
  unarchivePropertyType(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    params,
  );
