import { ApolloError } from "apollo-server-express";
import { AxiosError } from "axios";
import { EntityTypeWithMetadata, Subgraph } from "@hashintel/hash-subgraph";
import { AccountId, OwnedById } from "@hashintel/hash-shared/types";

import {
  MutationCreateEntityTypeArgs,
  MutationUpdateEntityTypeArgs,
  QueryGetEntityTypeArgs,
  QueryGetAllLatestEntityTypesArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import {
  createEntityType,
  updateEntityType,
} from "../../../graph/ontology/primitive/entity-type";

export const createEntityTypeResolver: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { ownedById, entityType } = params;

  const createdEntityType = await createEntityType(
    { graphApi },
    {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
      ownedById: (ownedById as OwnedById) ?? userModel.getEntityUuid(),
      schema: entityType,
      actorId: userModel.getEntityUuid() as AccountId,
    },
  ).catch((err) => {
    throw new ApolloError(err, "CREATION_ERROR");
  });

  return createdEntityType;
};

export const getAllLatestEntityTypesResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestEntityTypesArgs
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

  const { data: entityTypeSubgraph } = await graphApi
    .getEntityTypesByQuery({
      filter: {
        equal: [{ path: ["version"] }, { parameter: "latest" }],
      },
      graphResolveDepths: {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn,
        constrainsPropertiesOn,
        constrainsLinksOn,
        constrainsLinkDestinationsOn,
        isOfType: { outgoing: 0 },
        hasLeftEntity: { incoming: 0, outgoing: 0 },
        hasRightEntity: { incoming: 0, outgoing: 0 },
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve all latest entity types. ${err.response?.data}`,
        "GET_ALL_ERROR",
      );
    });

  return entityTypeSubgraph as Subgraph;
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

  const { data: entityTypeSubgraph } = await graphApi
    .getEntityTypesByQuery({
      filter: {
        equal: [{ path: ["versionedUri"] }, { parameter: entityTypeId }],
      },
      graphResolveDepths: {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn,
        constrainsPropertiesOn,
        constrainsLinksOn,
        constrainsLinkDestinationsOn,
        isOfType: { outgoing: 0 },
        hasLeftEntity: { incoming: 0, outgoing: 0 },
        hasRightEntity: { incoming: 0, outgoing: 0 },
      },
    })
    .catch((err: AxiosError) => {
      throw new ApolloError(
        `Unable to retrieve entity type. ${err.response?.data}`,
        "GET_ERROR",
      );
    });

  return entityTypeSubgraph as Subgraph;
};

export const updateEntityTypeResolver: ResolverFn<
  Promise<EntityTypeWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (_, params, { dataSources, userModel }) => {
  const { graphApi } = dataSources;
  const { entityTypeId, updatedEntityType: updatedEntityTypeSchema } = params;

  const updatedEntityType = await updateEntityType(
    { graphApi },
    {
      entityTypeId,
      schema: updatedEntityTypeSchema,
      actorId: userModel.getEntityUuid() as AccountId,
    },
  ).catch((err: AxiosError) => {
    const msg =
      err.response?.status === 409
        ? `Entity type URI doesn't exist, unable to update. [URI=${entityTypeId}]`
        : `Couldn't update entity type.`;

    throw new ApolloError(msg, "CREATION_ERROR");
  });

  return updatedEntityType;
};
