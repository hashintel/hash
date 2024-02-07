import { OntologyTemporalMetadata } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { UserPermissionsOnEntityType } from "@local/hash-isomorphic-utils/types";
import {
  EntityTypeRootType,
  EntityTypeWithMetadata,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-subgraph/stdlib";

import {
  archiveEntityType,
  checkPermissionsOnEntityType,
  createEntityType,
  getEntityTypeSubgraphById,
  unarchiveEntityType,
  updateEntityType,
} from "../../../graph/ontology/primitive/entity-type";
import {
  MutationArchiveEntityTypeArgs,
  MutationCreateEntityTypeArgs,
  MutationUnarchiveEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryCheckUserPermissionsOnEntityTypeArgs,
  QueryGetEntityTypeArgs,
  QueryQueryEntityTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { graphQLContextToImpureGraphContext } from "../util";

export const createEntityTypeResolver: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, params, graphQLContext) => {
  const { authentication, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const { ownedById, entityType } = params;

  const createdEntityType = await createEntityType(context, authentication, {
    ownedById: ownedById ?? (user.accountId as OwnedById),
    schema: entityType,
    icon: params.icon ?? undefined,
    labelProperty: params.labelProperty ?? undefined,
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
      {
        relation: "instantiator",
        subject: {
          kind: "public",
        },
      },
    ],
  });

  return createdEntityType;
};

export const queryEntityTypesResolver: ResolverFn<
  Promise<Subgraph>,
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
    inheritsFrom,
    latestOnly = true,
    includeArchived = false,
  },
  { dataSources, authentication },
  __,
) => {
  const { graphApi } = dataSources;

  const { data } = await graphApi.getEntityTypesByQuery(
    authentication.actorId,
    {
      filter: latestOnly
        ? {
            equal: [{ path: ["version"] }, { parameter: "latest" }],
          }
        : { all: [] },
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
      includeDrafts: false,
    },
  );

  const subgraph = mapGraphApiSubgraphToSubgraph<EntityTypeRootType>(data);

  return subgraph;
};

export const getEntityTypeResolver: ResolverFn<
  Promise<Subgraph>,
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
  getEntityTypeSubgraphById(
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
      labelProperty: params.labelProperty ?? undefined,
      icon: params.icon ?? undefined,
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
        {
          relation: "instantiator",
          subject: {
            kind: "public",
          },
        },
      ],
    },
  );

export const checkUserPermissionsOnEntityTypeResolver: ResolverFn<
  Promise<UserPermissionsOnEntityType>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryCheckUserPermissionsOnEntityTypeArgs
> = async (_, params, { dataSources, authentication }) =>
  checkPermissionsOnEntityType(dataSources, authentication, params);

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
