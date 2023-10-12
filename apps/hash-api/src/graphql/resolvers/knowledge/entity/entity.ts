import { Filter, QueryTemporalAxesUnresolved } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  Entity,
  OwnedById,
  splitEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import {
  ApolloError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-express";

import {
  archiveEntity,
  createEntityWithLinks,
  getEntities,
  getLatestEntityById,
  updateEntity,
} from "../../../../graph/knowledge/primitive/entity";
import { bpMultiFilterToGraphFilter } from "../../../../graph/knowledge/primitive/entity/query";
import {
  createLinkEntity,
  isEntityLinkEntity,
  updateLinkEntity,
} from "../../../../graph/knowledge/primitive/link-entity";
import { getEntityTypeById } from "../../../../graph/ontology/primitive/entity-type";
import { genId } from "../../../../util";
import {
  Mutation,
  MutationArchiveEntityArgs,
  MutationCreateEntityArgs,
  MutationInferEntitiesArgs,
  MutationUpdateEntityArgs,
  QueryGetEntityArgs,
  QueryResolvers,
  QueryStructuralQueryEntitiesArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapEntityToGQL } from "../graphql-mapping";
import { beforeUpdateEntityHooks } from "./before-update-entity-hooks";

export const createEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  { ownedById, properties, entityTypeId, linkedEntities, linkData },
  { dataSources, authentication, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  /**
   * @todo: prevent callers of this mutation from being able to create restricted
   * system types (e.g. a `User` or an `Org`)
   *
   * @see https://app.asana.com/0/1202805690238892/1203084714149803/f
   */

  let entity: Entity | LinkEntity;

  if (linkData) {
    const { leftEntityId, leftToRightOrder, rightEntityId, rightToLeftOrder } =
      linkData;

    const [leftEntity, rightEntity, linkEntityType] = await Promise.all([
      getLatestEntityById(context, authentication, {
        entityId: leftEntityId,
      }),
      getLatestEntityById(context, authentication, {
        entityId: rightEntityId,
      }),
      getEntityTypeById(context, authentication, { entityTypeId }),
    ]);

    entity = await createLinkEntity(context, authentication, {
      leftEntityId: leftEntity.metadata.recordId.entityId,
      leftToRightOrder: leftToRightOrder ?? undefined,
      rightEntityId: rightEntity.metadata.recordId.entityId,
      rightToLeftOrder: rightToLeftOrder ?? undefined,
      properties,
      linkEntityType,
      ownedById: ownedById ?? (user.accountId as OwnedById),
    });
  } else {
    entity = await createEntityWithLinks(context, authentication, {
      ownedById: ownedById ?? (user.accountId as OwnedById),
      entityTypeId,
      properties,
      linkedEntities: linkedEntities ?? undefined,
    });
  }

  return mapEntityToGQL(entity);
};

export const queryEntitiesResolver: Extract<
  QueryResolvers<GraphQLContext>["queryEntities"],
  Function
> = async (
  _,
  {
    operation,
    constrainsValuesOn,
    constrainsPropertiesOn,
    constrainsLinksOn,
    constrainsLinkDestinationsOn,
    inheritsFrom,
    isOfType,
    hasLeftEntity,
    hasRightEntity,
  },
  { logger, dataSources, authentication },
  __,
) => {
  if (operation.multiSort !== undefined && operation.multiSort !== null) {
    throw new ApolloError(
      "Sorting on queryEntities  results is not currently supported",
    );
  }

  const filter = operation.multiFilter
    ? bpMultiFilterToGraphFilter(operation.multiFilter)
    : { any: [] };

  if ("any" in filter && filter.any.length === 0) {
    logger.warn(
      "QueryEntities called with empty filter and OR operator, which means returning an empty subgraph. This is probably not what you want. Use multiFilter: { filters: [], operator: AND } to return all entities.",
    );
  }

  const entitySubgraph = await getEntities(dataSources, authentication, {
    query: {
      filter,
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
        constrainsPropertiesOn,
        constrainsLinksOn,
        constrainsLinkDestinationsOn,
        inheritsFrom,
        isOfType,
        hasLeftEntity,
        hasRightEntity,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  });

  return entitySubgraph;
};

export const structuralQueryEntitiesResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryStructuralQueryEntitiesArgs
> = async (_, { query }, context) => {
  return getEntities(context.dataSources, context.authentication, {
    query,
  });
};

export const getEntityResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  GraphQLContext,
  QueryGetEntityArgs
> = async (
  _,
  {
    entityId,
    entityVersion,
    constrainsValuesOn,
    constrainsPropertiesOn,
    constrainsLinksOn,
    constrainsLinkDestinationsOn,
    inheritsFrom,
    isOfType,
    hasLeftEntity,
    hasRightEntity,
  },
  { dataSources, authentication },
  __,
) => {
  const [ownedById, entityUuid] = splitEntityId(entityId);

  const filter: Filter = {
    all: [
      {
        equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
      },
      {
        equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
      },
    ],
  };

  // If an entity version is specified, the result is constrained to that version.
  // This is done by providing a time interval with the same start and end as given by the version.
  const temporalAxes: QueryTemporalAxesUnresolved = entityVersion
    ? {
        pinned: {
          axis: "transactionTime",
          timestamp: null,
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: { kind: "inclusive", limit: entityVersion },
            end: { kind: "inclusive", limit: entityVersion },
          },
        },
      }
    : currentTimeInstantTemporalAxes;

  const entitySubgraph = await getEntities(dataSources, authentication, {
    query: {
      filter,
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn,
        constrainsPropertiesOn,
        constrainsLinksOn,
        constrainsLinkDestinationsOn,
        inheritsFrom,
        isOfType,
        hasLeftEntity,
        hasRightEntity,
      },
      temporalAxes,
    },
  });

  return entitySubgraph;
};

export const updateEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityArgs
> = async (
  _,
  {
    entityId,
    updatedProperties,
    leftToRightOrder,
    rightToLeftOrder,
    entityTypeId,
  },
  { dataSources, authentication: uncheckedAuthenticationContext, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const isIncompleteUser = !user.isAccountSignupComplete;
  const isUpdatingOwnEntity =
    entityId === user.entity.metadata.recordId.entityId;

  // The user needs to have completed signup if they aren't updating their own user entity
  if (isIncompleteUser && !isUpdatingOwnEntity) {
    throw new ForbiddenError(
      "You must complete the sign-up process to perform this action.",
    );
  }

  /*
   * We default incomplete users to acting as an unauthenticated user when creating the authentication context.
   * They are allowed to perform this mutation, so we need to restore their actorId.
   */
  const authentication = isIncompleteUser
    ? {
        ...uncheckedAuthenticationContext,
        actorId: user.accountId,
      }
    : uncheckedAuthenticationContext;

  const entity = await getLatestEntityById(context, authentication, {
    entityId,
  });

  for (const beforeUpdateHook of beforeUpdateEntityHooks) {
    if (beforeUpdateHook.entityTypeId === entity.metadata.entityTypeId) {
      await beforeUpdateHook.callback({
        context,
        entity,
        updatedProperties,
      });
    }
  }

  let updatedEntity: Entity;

  if (isEntityLinkEntity(entity)) {
    updatedEntity = await updateLinkEntity(context, authentication, {
      linkEntity: entity,
      properties: updatedProperties,
      leftToRightOrder: leftToRightOrder ?? undefined,
      rightToLeftOrder: rightToLeftOrder ?? undefined,
    });
  } else {
    if (leftToRightOrder || rightToLeftOrder) {
      throw new UserInputError(
        `Cannot update the left to right order or right to left order of entity with ID ${entity.metadata.recordId.entityId} because it isn't a link.`,
      );
    }

    updatedEntity = await updateEntity(context, authentication, {
      entity,
      entityTypeId: entityTypeId ?? undefined,
      properties: updatedProperties,
    });
  }

  return mapEntityToGQL(updatedEntity);
};

export const archiveEntityResolver: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationArchiveEntityArgs
> = async (_, { entityId }, { dataSources: context, authentication }) => {
  const entity = await getLatestEntityById(context, authentication, {
    entityId,
  });

  await archiveEntity(context, authentication, { entity });

  return true;
};

export const inferEntitiesResolver: ResolverFn<
  Mutation["inferEntities"],
  null,
  LoggedInGraphQLContext,
  MutationInferEntitiesArgs
> = async (_, args, { authentication, temporal }) => {
  if (!temporal) {
    throw new Error("Temporal client not available");
  }

  const status = await temporal.workflow.execute("inferEntities", {
    taskQueue: "aipy",
    args: [
      {
        authentication,
        ...args,
        maxTokens: args.maxTokens === 0 ? null : args.maxTokens,
      },
    ],
    workflowId: `inferEntities-${genId()}`,
  });

  if (status.code !== "OK") {
    throw new Error(status.message);
  }

  return status.contents[0];
};
