import { OntologyTemporalMetadata } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  EntityTypeRootType,
  EntityTypeWithMetadata,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-subgraph/stdlib";

import {
  archiveEntityType,
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
  QueryGetEntityTypeArgs,
  QueryQueryEntityTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { dataSourcesToImpureGraphContext } from "../util";

export const createEntityTypeResolver: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, params, { dataSources, authentication, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { ownedById, entityType } = params;

  const createdEntityType = await createEntityType(context, authentication, {
    ownedById: ownedById ?? (user.accountId as OwnedById),
    schema: entityType,
    icon: params.icon ?? undefined,
    relationships: [
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
    inheritedPermissions: ["updateFromWeb"],
  });

  return createdEntityType;
};

export const queryEntityTypesResolver: ResolverFn<
  Promise<Subgraph>,
  {},
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
        ? {
            pinned: {
              axis: "decisionTime",
              timestamp: null,
            },
            variable: {
              axis: "transactionTime",
              interval: {
                start: {
                  kind: "unbounded",
                },
                end: null,
              },
            },
          }
        : currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  );

  const subgraph = mapGraphApiSubgraphToSubgraph<EntityTypeRootType>(data);

  return subgraph;
};

export const getEntityTypeResolver: ResolverFn<
  Promise<Subgraph>,
  {},
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
  },
  { dataSources, authentication },
  __,
) =>
  getEntityTypeSubgraphById(
    dataSourcesToImpureGraphContext(dataSources),
    authentication,
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
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

export const updateEntityTypeResolver: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (_, params, { dataSources, authentication }) =>
  updateEntityType(
    dataSourcesToImpureGraphContext(dataSources),
    authentication,
    {
      entityTypeId: params.entityTypeId,
      schema: params.updatedEntityType,
      labelProperty: params.labelProperty ?? undefined,
      icon: params.icon ?? undefined,
      instantiators: [{ kind: "public" }],
    },
  );

export const archiveEntityTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationArchiveEntityTypeArgs
> = async (_, params, { dataSources, authentication }) =>
  archiveEntityType(dataSources, authentication, params);

export const unarchiveEntityTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUnarchiveEntityTypeArgs
> = async (_, params, { dataSources, authentication }) =>
  unarchiveEntityType(dataSources, authentication, params);
