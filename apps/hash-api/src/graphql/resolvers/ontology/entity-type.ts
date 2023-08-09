import { OntologyTemporalMetadata } from "@local/hash-graph-client";
import {
  EntityTypeRootType,
  EntityTypeWithMetadata,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";

import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "../../../graph";
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

  const createdEntityType = await createEntityType(context, {
    ownedById: ownedById ?? (user.accountId as OwnedById),
    schema: entityType,
    actorId: user.accountId,
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
    latestOnly = true,
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const { data: entityTypeSubgraph } = await graphApi.getEntityTypesByQuery({
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
    },
    temporalAxes: currentTimeInstantTemporalAxes,
  });

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
  },
  { dataSources, user },
  __,
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  return await getEntityTypeSubgraphById(context, {
    entityTypeId,
    actorId: user?.accountId,
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      constrainsValuesOn,
      constrainsPropertiesOn,
      constrainsLinksOn,
      constrainsLinkDestinationsOn,
    },
    temporalAxes: currentTimeInstantTemporalAxes,
  });
};

export const updateEntityTypeResolver: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (_, params, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { entityTypeId, updatedEntityType: updatedEntityTypeSchema } = params;

  const updatedEntityType = await updateEntityType(context, {
    entityTypeId,
    schema: updatedEntityTypeSchema,
    actorId: user.accountId,
  });

  return updatedEntityType;
};

export const archiveEntityTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationArchiveEntityTypeArgs
> = async (_, params, { dataSources, user }) =>
  archiveEntityType(dataSources, {
    actorId: user.accountId,
    ...params,
  });

export const unarchiveEntityTypeResolver: ResolverFn<
  Promise<OntologyTemporalMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUnarchiveEntityTypeArgs
> = async (_, params, { dataSources, user }) =>
  unarchiveEntityType(dataSources, {
    actorId: user.accountId,
    ...params,
  });
