import type {
  EntityTypeWithMetadata,
  OntologyTemporalMetadata,
  WebId,
} from "@blockprotocol/type-system";
import type { UserPermissionsOnEntityType } from "@local/hash-graph-sdk/authorization";
import type { SerializedSubgraph } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  defaultEntityTypeAuthorizationRelationships,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import { ApolloError } from "apollo-server-express";

import {
  archiveEntityType,
  checkPermissionsOnEntityType,
  createEntityType,
  getClosedMultiEntityTypes,
  getEntityTypeSubgraph,
  getEntityTypeSubgraphById,
  unarchiveEntityType,
  updateEntityType,
  updateEntityTypes,
} from "../../../graph/ontology/primitive/entity-type";
import type {
  GetClosedMultiEntityTypesResponse,
  MutationArchiveEntityTypeArgs,
  MutationCreateEntityTypeArgs,
  MutationUnarchiveEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  MutationUpdateEntityTypesArgs,
  QueryCheckUserPermissionsOnEntityTypeArgs,
  QueryGetClosedMultiEntityTypesArgs,
  QueryGetEntityTypeArgs,
  QueryQueryEntityTypesArgs,
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
    relationships: defaultEntityTypeAuthorizationRelationships,
  });

  return createdEntityType;
};

export const queryEntityTypesResolver: ResolverFn<
  Promise<SerializedSubgraph>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryQueryEntityTypesArgs
> = async (
  _,
  {
    constrainsValuesOn,
    constrainsPropertiesOn,
    constrainsLinksOn,
    constrainsLinkDestinationsOn,
    filter,
    inheritsFrom,
    latestOnly = true,
    includeArchived = false,
  },
  { dataSources, authentication, provenance, temporal },
  __,
) => {
  const { graphApi } = dataSources;

  const latestOnlyFilter = {
    equal: [{ path: ["version"] }, { parameter: "latest" }],
  };

  return serializeSubgraph(
    await getEntityTypeSubgraph(
      { graphApi, provenance, temporalClient: temporal },
      authentication,
      {
        filter: latestOnly
          ? filter
            ? { all: [filter, latestOnlyFilter] }
            : latestOnlyFilter
          : (filter ?? { all: [] }),
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          constrainsValuesOn,
          constrainsPropertiesOn,
          constrainsLinksOn,
          constrainsLinkDestinationsOn,
          inheritsFrom,
        },
        temporalAxes: includeArchived
          ? fullTransactionTimeAxis
          : currentTimeInstantTemporalAxes,
      },
    ),
  );
};

export const getEntityTypeResolver: ResolverFn<
  Promise<SerializedSubgraph>,
  Record<string, never>,
  GraphQLContext,
  QueryGetEntityTypeArgs
> = async (
  _,
  {
    entityTypeId,
    constrainsValuesOn,
    constrainsPropertiesOn,
    constrainsLinksOn,
    constrainsLinkDestinationsOn,
    inheritsFrom,
    includeArchived,
  },
  graphQLContext,
  __,
) =>
  serializeSubgraph(
    await getEntityTypeSubgraphById(
      graphQLContextToImpureGraphContext(graphQLContext),
      graphQLContext.authentication,
      {
        entityTypeId,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          constrainsValuesOn,
          constrainsPropertiesOn,
          constrainsLinksOn,
          constrainsLinkDestinationsOn,
          inheritsFrom,
        },
        temporalAxes: includeArchived
          ? fullTransactionTimeAxis
          : currentTimeInstantTemporalAxes,
      },
    ),
  );

export const getClosedMultiEntityTypesResolver: ResolverFn<
  Promise<GetClosedMultiEntityTypesResponse>,
  Record<string, never>,
  GraphQLContext,
  QueryGetClosedMultiEntityTypesArgs
> = async (_, args, graphQLContext) => {
  const { entityTypeIds, includeArchived } = args;

  const { closedMultiEntityTypes, definitions } =
    await getClosedMultiEntityTypes(
      graphQLContextToImpureGraphContext(graphQLContext),
      graphQLContext.authentication,
      {
        entityTypeIds,
        // All references to other types are resolved, and those types provided under 'definitions' in the response,
        // including the children of any data types which are resolved (to allow picking more specific types)
        includeResolved: "resolvedWithDataTypeChildren",
        temporalAxes: includeArchived
          ? fullTransactionTimeAxis
          : currentTimeInstantTemporalAxes,
      },
    );

  if (!definitions) {
    throw new ApolloError("No definitions found for closed multi entity type");
  }

  return {
    closedMultiEntityTypes,
    definitions,
  };
};

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
      relationships: defaultEntityTypeAuthorizationRelationships,
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
