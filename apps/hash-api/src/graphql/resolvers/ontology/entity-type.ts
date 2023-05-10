import {
  EntityTypeRootType,
  EntityTypeWithMetadata,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";

import { currentTemporalAxes, zeroedGraphResolveDepths } from "../../../graph";
import {
  createEntityType,
  updateEntityType,
} from "../../../graph/ontology/primitive/entity-type";
import {
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  QueryQueryEntityTypesArgs,
  ResolverFn,
} from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";
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
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const { data: entityTypeSubgraph } = await graphApi.getEntityTypesByQuery({
    filter: {
      equal: [{ path: ["version"] }, { parameter: "latest" }],
    },
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      constrainsValuesOn,
      constrainsPropertiesOn,
      constrainsLinksOn,
      constrainsLinkDestinationsOn,
    },
    temporalAxes: currentTemporalAxes,
  });

  return entityTypeSubgraph as Subgraph<EntityTypeRootType>;
};

export const getEntityTypeResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
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
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const { data: entityTypeSubgraph } = await graphApi.getEntityTypesByQuery({
    filter: {
      equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
    },
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      constrainsValuesOn,
      constrainsPropertiesOn,
      constrainsLinksOn,
      constrainsLinkDestinationsOn,
    },
    temporalAxes: currentTemporalAxes,
  });

  return entityTypeSubgraph as Subgraph<EntityTypeRootType>;
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
