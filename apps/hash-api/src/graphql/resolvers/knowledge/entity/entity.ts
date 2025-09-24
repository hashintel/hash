import type { Entity, EntityId, WebId } from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  mustHaveAtLeastOne,
  splitEntityId,
} from "@blockprotocol/type-system";
import { convertBpFilterToGraphFilter } from "@local/hash-backend-utils/convert-bp-filter-to-graph-filter";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  Filter,
  QueryTemporalAxesUnresolved,
} from "@local/hash-graph-client";
import {
  HashEntity,
  queryEntitySubgraph,
  serializeQueryEntitySubgraphResponse,
} from "@local/hash-graph-sdk/entity";
import {
  createPolicy,
  deletePolicyById,
  queryPolicies,
} from "@local/hash-graph-sdk/policy";
import { serializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import type { EntityValidationReport } from "@local/hash-graph-sdk/validation";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationArchiveEntitiesArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  ApolloError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-express";

import {
  canUserReadEntity,
  checkEntityPermission,
  countEntities,
  createEntityWithLinks,
  getLatestEntityById,
  updateEntity,
} from "../../../../graph/knowledge/primitive/entity";
import {
  createLinkEntity,
  isEntityLinkEntity,
  updateLinkEntity,
} from "../../../../graph/knowledge/primitive/link-entity";
import type {
  MutationAddEntityViewerArgs,
  MutationArchiveEntityArgs,
  MutationCreateEntityArgs,
  MutationRemoveEntityViewerArgs,
  MutationUpdateEntitiesArgs,
  MutationUpdateEntityArgs,
  Query,
  QueryCountEntitiesArgs,
  QueryGetEntityArgs,
  QueryIsEntityPublicArgs,
  QueryQueryEntitySubgraphArgs,
  QueryResolvers,
  QueryValidateEntityArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { AuthorizationSubjectKind } from "../../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { getUserPermissionsOnSubgraph } from "../shared/get-user-permissions-on-subgraph";

export const createEntityResolver: ResolverFn<
  Promise<Entity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  { webId, properties, entityTypeIds, linkedEntities, linkData, draft },
  graphQLContext,
) => {
  const { authentication, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  /**
   * @todo: prevent callers of this mutation from being able to create restricted
   * system types (e.g. a `User` or an `Org`)
   * @see https://linear.app/hash/issue/H-2993
   */

  let entity: Entity;

  if (linkData) {
    const { leftEntityId, rightEntityId } = linkData;

    await Promise.all([
      canUserReadEntity(context, authentication, {
        entityId: leftEntityId,
        includeDrafts: draft ?? false,
      }),
      canUserReadEntity(context, authentication, {
        entityId: rightEntityId,
        includeDrafts: draft ?? false,
      }),
    ]);

    entity = await createLinkEntity(context, authentication, {
      webId: webId ?? (user.accountId as WebId),
      properties,
      linkData: {
        leftEntityId,
        rightEntityId,
      },
      entityTypeIds: mustHaveAtLeastOne(entityTypeIds),
      draft: draft ?? undefined,
    });
  } else {
    entity = await createEntityWithLinks(context, authentication, {
      webId: webId ?? (user.accountId as WebId),
      entityTypeIds: mustHaveAtLeastOne(entityTypeIds),
      properties,
      linkedEntities: linkedEntities ?? undefined,
      draft: draft ?? undefined,
    });
  }

  return entity;
};

export const queryEntitiesResolver: NonNullable<
  QueryResolvers<GraphQLContext>["queryEntities"]
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
    includeDrafts,
  },
  graphQLContext,
  info,
) => {
  const { authentication, logger } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  if (operation.multiSort !== undefined && operation.multiSort !== null) {
    throw new ApolloError(
      "Sorting on queryEntities  results is not currently supported",
    );
  }

  const filter = operation.multiFilter
    ? convertBpFilterToGraphFilter(operation.multiFilter)
    : { any: [] };

  if ("any" in filter && filter.any.length === 0) {
    logger.warn(
      "QueryEntities called with empty filter and OR operator, which means returning an empty subgraph. This is probably not what you want. Use multiFilter: { filters: [], operator: AND } to return all entities.",
    );
  }

  const { subgraph: entitySubgraph } = await queryEntitySubgraph(
    context,
    authentication,
    {
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
      includeDrafts: includeDrafts ?? false,
      includePermissions: false,
    },
  );

  const userPermissionsOnEntities = await getUserPermissionsOnSubgraph(
    graphQLContext,
    info,
    entitySubgraph,
  );

  return {
    subgraph: serializeSubgraph(entitySubgraph),
    userPermissionsOnEntities,
  };
};

export const countEntitiesResolver: ResolverFn<
  Query["countEntities"],
  Record<string, never>,
  GraphQLContext,
  QueryCountEntitiesArgs
> = async (_, { request }, graphQLContext) => {
  const count = await countEntities(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    request,
  );

  return count;
};

export const queryEntitySubgraphResolver: ResolverFn<
  Query["queryEntitySubgraph"],
  Record<string, never>,
  GraphQLContext,
  QueryQueryEntitySubgraphArgs
> = async (_, { request }, graphQLContext, info) => {
  const includePermissions = request.includePermissions;
  const { subgraph, ...response } = await queryEntitySubgraph(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    { ...request, includePermissions: false },
  );

  // TODO: Move this logic into the Graph
  //   see https://linear.app/hash/issue/BE-127/allow-including-permission-in-entity-query-responses
  const entityPermissions = includePermissions
    ? await getUserPermissionsOnSubgraph(graphQLContext, info, subgraph)
    : undefined;

  return serializeQueryEntitySubgraphResponse({
    subgraph,
    ...response,
    entityPermissions,
  });
};

export const getEntityResolver: ResolverFn<
  Query["getEntity"],
  Record<string, never>,
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
    includeDrafts,
  },
  graphQLContext,
  info,
) => {
  const [webId, entityUuid, draftId] = splitEntityId(entityId);

  const filter: Filter = {
    all: [
      {
        equal: [{ path: ["webId"] }, { parameter: webId }],
      },
      {
        equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
      },
    ],
  };
  if (draftId) {
    filter.all.push({
      equal: [{ path: ["draftId"] }, { parameter: draftId }],
    });
  }

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

  const { subgraph: entitySubgraph } = await queryEntitySubgraph(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
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
      includeDrafts: includeDrafts ?? false,
      includePermissions: false,
    },
  );

  const userPermissionsOnEntities = await getUserPermissionsOnSubgraph(
    graphQLContext,
    info,
    entitySubgraph,
  );

  return {
    subgraph: serializeSubgraph(entitySubgraph),
    userPermissionsOnEntities,
  };
};

export const updateEntityResolver: ResolverFn<
  Promise<Entity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateEntityArgs
> = async (
  _,
  { entityUpdate: { draft, entityId, propertyPatches, entityTypeIds } },
  graphQLContext,
) => {
  const { authentication, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const isIncompleteUser = !user.isAccountSignupComplete;
  const isUpdatingOwnEntity =
    entityId === user.entity.metadata.recordId.entityId;

  // The user needs to have completed signup if they aren't updating their own user entity
  if (isIncompleteUser && !isUpdatingOwnEntity) {
    throw new ForbiddenError(
      "You must complete the sign-up process to perform this action.",
    );
  }

  const entity = await getLatestEntityById(context, authentication, {
    entityId,
  });

  let updatedEntity: Entity;

  if (isEntityLinkEntity(entity)) {
    updatedEntity = await updateLinkEntity(context, authentication, {
      linkEntity: entity,
      propertyPatches,
      draft: draft ?? undefined,
    });
  } else {
    updatedEntity = await updateEntity(context, authentication, {
      entity,
      entityTypeIds: entityTypeIds
        ? mustHaveAtLeastOne(entityTypeIds)
        : undefined,
      propertyPatches,
      draft: draft ?? undefined,
    });
  }

  return updatedEntity;
};

export const updateEntitiesResolver: ResolverFn<
  Promise<Entity[]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateEntitiesArgs
> = async (_, { entityUpdates }, context, info) => {
  /**
   * @todo: use bulk `updateEntities` endpoint in the Graph API
   * when it has been implemented.
   */
  const updatedEntities = await Promise.all(
    entityUpdates.map(async (entityUpdate) =>
      updateEntityResolver({}, { entityUpdate }, context, info),
    ),
  );

  return updatedEntities;
};

export const validateEntityResolver: ResolverFn<
  Promise<EntityValidationReport | undefined>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryValidateEntityArgs
> = async (_, params, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const response = await HashEntity.validate(
    context.graphApi,
    authentication,
    params,
  );

  return response;
};

export const archiveEntityResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveEntityArgs
> = async (_, { entityId }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const entity = await getLatestEntityById(context, authentication, {
    entityId,
  });

  await entity.archive(context.graphApi, authentication, context.provenance);

  return true;
};

export const archiveEntitiesResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveEntitiesArgs
> = async (_, { entityIds }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const archivedEntities: HashEntity[] = [];

  const entitiesThatCouldNotBeArchived: EntityId[] = [];

  await Promise.all(
    entityIds.map(async (entityId) => {
      try {
        const entity = await getLatestEntityById(context, authentication, {
          entityId,
        });

        await entity.archive(
          context.graphApi,
          authentication,
          context.provenance,
        );

        archivedEntities.push(entity);
      } catch {
        entitiesThatCouldNotBeArchived.push(entityId);
      }
    }),
  );

  if (entitiesThatCouldNotBeArchived.length > 0) {
    await Promise.all(
      archivedEntities.map((entity) =>
        entity.unarchive(context.graphApi, authentication, context.provenance),
      ),
    );

    throw new ApolloError(
      `Couldn't archive entities with IDs ${entityIds.join(", ")}`,
    );
  }

  return true;
};

export const addEntityViewerResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationAddEntityViewerArgs
> = async (_, { entityId, viewer }, graphQLContext) => {
  if (viewer.kind !== AuthorizationSubjectKind.Public) {
    throw new UserInputError("Only public viewers can be added to an entity");
  }

  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const entityUuid = extractEntityUuidFromEntityId(entityId);
  await createPolicy(context.graphApi, authentication, {
    name: `public-view-entity-${entityUuid}`,
    effect: "permit",
    actions: ["viewEntity"],
    principal: null,
    resource: {
      type: "entity",
      id: entityUuid,
    },
  });

  return true;
};

export const removeEntityViewerResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationRemoveEntityViewerArgs
> = async (_, { entityId, viewer }, graphQLContext) => {
  if (viewer.kind !== AuthorizationSubjectKind.Public) {
    throw new UserInputError(
      "Only public viewers can be removed from an entity",
    );
  }

  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const entityUuid = extractEntityUuidFromEntityId(entityId);
  const [policy] = await queryPolicies(context.graphApi, authentication, {
    name: `public-view-entity-${entityUuid}`,
    principal: {
      filter: "unconstrained",
    },
  });

  if (!policy) {
    return true; // No policy to delete, nothing to do
  }

  await deletePolicyById(context.graphApi, authentication, policy.id);

  return true;
};

export const isEntityPublicResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryIsEntityPublicArgs
> = async (_, { entityId }, graphQLContext) =>
  checkEntityPermission(
    graphQLContextToImpureGraphContext(graphQLContext),
    { actorId: publicUserAccountId },
    { entityId, permission: "viewEntity" },
  );
