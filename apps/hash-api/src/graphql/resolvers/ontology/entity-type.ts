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

import { publicUserAccountId } from "../../../graph";
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
> = async (_, params, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { ownedById, entityType } = params;

  const createdEntityType = await createEntityType(
    context,
    { actorId: user.accountId },
    {
      ownedById: ownedById ?? (user.accountId as OwnedById),
      schema: entityType,
    },
  );

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
  { dataSources, user },
  __,
) => {
  const { graphApi } = dataSources;

  const { data: entityTypeSubgraph } = await graphApi.getEntityTypesByQuery(
    user.accountId,
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
    },
  );

  return entityTypeSubgraph as Subgraph<EntityTypeRootType>;
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
  { dataSources, user },
  __,
) =>
  getEntityTypeSubgraphById(
    dataSourcesToImpureGraphContext(dataSources),
    { actorId: user?.accountId ?? publicUserAccountId },
    {
      entityTypeId,
      actorId: user?.accountId,
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
> = async (_, params, { dataSources, user }) =>
  updateEntityType(
    dataSourcesToImpureGraphContext(dataSources),
    { actorId: user.accountId },
    {
      entityTypeId: params.entityTypeId,
      schema: params.updatedEntityType,
      labelProperty: params.labelProperty ?? undefined,
    },
  );

export const archiveEntityTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationArchiveEntityTypeArgs
> = async (_, params, { dataSources, user }) =>
  archiveEntityType(dataSources, { actorId: user.accountId }, params);

export const unarchiveEntityTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUnarchiveEntityTypeArgs
> = async (_, params, { dataSources, user }) =>
  unarchiveEntityType(dataSources, { actorId: user.accountId }, params);
