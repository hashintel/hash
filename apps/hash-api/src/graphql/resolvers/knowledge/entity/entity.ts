import type {
  ActorEntityUuid,
  ActorGroupEntityUuid,
  Entity,
  EntityId,
  WebId,
} from "@blockprotocol/type-system";
import { mustHaveAtLeastOne, splitEntityId } from "@blockprotocol/type-system";
import { convertBpFilterToGraphFilter } from "@local/hash-backend-utils/convert-bp-filter-to-graph-filter";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  Filter,
  QueryTemporalAxesUnresolved,
} from "@local/hash-graph-client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import type { EntityValidationReport } from "@local/hash-graph-types/validation";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationArchiveEntitiesArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import {
  ApolloError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-express";

import {
  addEntityAdministrator,
  addEntityEditor,
  canUserReadEntity,
  checkEntityPermission,
  countEntities,
  createEntityWithLinks,
  getEntityAuthorizationRelationships,
  getEntitySubgraphResponse,
  getLatestEntityById,
  modifyEntityAuthorizationRelationships,
  removeEntityAdministrator,
  removeEntityEditor,
  updateEntity,
} from "../../../../graph/knowledge/primitive/entity";
import {
  createLinkEntity,
  isEntityLinkEntity,
  updateLinkEntity,
} from "../../../../graph/knowledge/primitive/link-entity";
import type {
  AuthorizationViewerInput,
  EntityAuthorizationRelationship,
  MutationAddEntityEditorArgs,
  MutationAddEntityOwnerArgs,
  MutationAddEntityViewerArgs,
  MutationArchiveEntityArgs,
  MutationCreateEntityArgs,
  MutationRemoveEntityEditorArgs,
  MutationRemoveEntityOwnerArgs,
  MutationRemoveEntityViewerArgs,
  MutationUpdateEntitiesArgs,
  MutationUpdateEntityArgs,
  Query,
  QueryCountEntitiesArgs,
  QueryGetEntityArgs,
  QueryGetEntitySubgraphArgs,
  QueryIsEntityPublicArgs,
  QueryResolvers,
  QueryValidateEntityArgs,
  ResolverFn,
} from "../../../api-types.gen";
import {
  AccountGroupAuthorizationSubjectRelation,
  AuthorizationSubjectKind,
  EntityAuthorizationRelation,
} from "../../../api-types.gen";
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
  {
    webId,
    properties,
    entityTypeIds,
    linkedEntities,
    linkData,
    draft,
    relationships,
  },
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
      relationships:
        relationships ??
        createDefaultAuthorizationRelationships(authentication),
      draft: draft ?? undefined,
    });
  } else {
    entity = await createEntityWithLinks(context, authentication, {
      webId: webId ?? (user.accountId as WebId),
      entityTypeIds: mustHaveAtLeastOne(entityTypeIds),
      properties,
      linkedEntities: linkedEntities ?? undefined,
      relationships: createDefaultAuthorizationRelationships(authentication),
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

  const { subgraph: entitySubgraph } = await getEntitySubgraphResponse(
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

export const getEntitySubgraphResolver: ResolverFn<
  Query["getEntitySubgraph"],
  Record<string, never>,
  GraphQLContext,
  QueryGetEntitySubgraphArgs
> = async (_, { request }, graphQLContext, info) => {
  const { subgraph, ...rest } = await getEntitySubgraphResponse(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    request,
  );

  const userPermissionsOnEntities = await getUserPermissionsOnSubgraph(
    graphQLContext,
    info,
    subgraph,
  );

  return {
    subgraph: serializeSubgraph(subgraph),
    userPermissionsOnEntities,
    ...rest,
  };
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

  const { subgraph: entitySubgraph } = await getEntitySubgraphResponse(
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

export const addEntityOwnerResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationAddEntityOwnerArgs
> = async (_, { entityId, owner }, graphQLContext) => {
  const { authentication } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await addEntityAdministrator(context, authentication, {
    entityId,
    administrator: owner,
  });

  return true;
};

export const removeEntityOwnerResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationRemoveEntityOwnerArgs
> = async (_, { entityId, owner }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await removeEntityAdministrator(context, authentication, {
    entityId,
    administrator: owner,
  });

  return true;
};

export const addEntityEditorResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationAddEntityEditorArgs
> = async (_, { entityId, editor }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await addEntityEditor(context, authentication, { entityId, editor });

  return true;
};

export const removeEntityEditorResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationRemoveEntityEditorArgs
> = async (_, { entityId, editor }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await removeEntityEditor(context, authentication, { entityId, editor });

  return true;
};

const parseGqlAuthorizationViewerInput = ({
  kind,
  viewer,
}: AuthorizationViewerInput) => {
  if (kind === AuthorizationSubjectKind.Public) {
    return { kind: "public" } as const;
  } else if (kind === AuthorizationSubjectKind.Account) {
    if (!viewer) {
      throw new UserInputError("Viewer Account ID must be specified");
    }
    return { kind: "account", subjectId: viewer as ActorEntityUuid } as const;
  } else {
    if (!viewer) {
      throw new UserInputError("Viewer Account Group ID must be specified");
    }
    return {
      kind: "accountGroup",
      subjectId: viewer as ActorGroupEntityUuid,
      subjectSet: "member",
    } as const;
  }
};

export const addEntityViewerResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationAddEntityViewerArgs
> = async (_, { entityId, viewer }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await modifyEntityAuthorizationRelationships(context, authentication, [
    {
      operation: "touch",
      relationship: {
        resource: {
          kind: "entity",
          resourceId: entityId,
        },
        relation: "viewer",
        subject: parseGqlAuthorizationViewerInput(viewer),
      },
    },
  ]);

  return true;
};

export const removeEntityViewerResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationRemoveEntityViewerArgs
> = async (_, { entityId, viewer }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  await modifyEntityAuthorizationRelationships(context, authentication, [
    {
      operation: "delete",
      relationship: {
        resource: {
          kind: "entity",
          resourceId: entityId,
        },
        relation: "viewer",
        subject: parseGqlAuthorizationViewerInput(viewer),
      },
    },
  ]);

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
    { entityId, permission: "view" },
  );

export const getEntityAuthorizationRelationshipsResolver: ResolverFn<
  EntityAuthorizationRelationship[],
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryIsEntityPublicArgs
> = async (_, { entityId }, graphQLContext) => {
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const relationships = await getEntityAuthorizationRelationships(
    context,
    graphQLContext.authentication,
    { entityId },
  );

  /**
   * @todo align definitions with the ones in the API
   *
   * @see https://linear.app/hash/issue/H-1115/use-permission-types-from-graph-in-graphql
   */
  return relationships
    .filter(({ subject }) =>
      ["account", "accountGroup", "public"].includes(subject.kind),
    )
    .map(({ resource, relation, subject }) => ({
      objectEntityId: resource.resourceId,
      relation:
        relation === "editor"
          ? EntityAuthorizationRelation.Editor
          : relation === "administrator"
            ? EntityAuthorizationRelation.Owner
            : EntityAuthorizationRelation.Viewer,
      subject:
        subject.kind === "accountGroup"
          ? {
              accountGroupId: subject.subjectId,
              relation: AccountGroupAuthorizationSubjectRelation.Member,
            }
          : subject.kind === "account"
            ? { accountId: subject.subjectId }
            : { public: true },
    }));
};
