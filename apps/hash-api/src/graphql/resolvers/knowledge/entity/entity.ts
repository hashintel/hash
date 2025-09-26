import type { Entity, EntityId, WebId } from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  mustHaveAtLeastOne,
} from "@blockprotocol/type-system";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
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
import type { EntityValidationReport } from "@local/hash-graph-sdk/validation";
import type { MutationArchiveEntitiesArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  ApolloError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-express";

import {
  canUserReadEntity,
  checkEntityPermission,
  checkPermissionsOnEntitiesInSubgraph,
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
  QueryIsEntityPublicArgs,
  QueryQueryEntitySubgraphArgs,
  QueryValidateEntityArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { AuthorizationSubjectKind } from "../../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

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
> = async (_, { request }, graphQLContext, __) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);
  const { authentication } = graphQLContext;

  const includePermissions = request.includePermissions;
  const { subgraph, ...response } = await queryEntitySubgraph(
    context,
    authentication,
    { ...request, includePermissions: false },
  );

  // TODO: Move this logic into the Graph
  //   see https://linear.app/hash/issue/BE-127/allow-including-permission-in-entity-query-responses
  const entityPermissions = includePermissions
    ? await checkPermissionsOnEntitiesInSubgraph(context, authentication, {
        subgraph,
      })
    : undefined;

  return serializeQueryEntitySubgraphResponse({
    subgraph,
    ...response,
    entityPermissions,
  });
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
