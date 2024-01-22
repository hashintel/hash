import { Filter, QueryTemporalAxesUnresolved } from "@local/hash-graph-client";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { MutationArchiveEntitiesArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  AccountGroupId,
  AccountId,
  Entity,
  EntityId,
  OwnedById,
  splitEntityId,
} from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import {
  ApolloError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-express";

import { publicUserAccountId } from "../../../../auth/public-user-account-id";
import {
  addEntityAdministrator,
  addEntityEditor,
  archiveEntity,
  checkEntityPermission,
  createEntityWithLinks,
  getEntities,
  getEntityAuthorizationRelationships,
  getLatestEntityById,
  modifyEntityAuthorizationRelationships,
  removeEntityAdministrator,
  removeEntityEditor,
  unarchiveEntity,
  updateEntity,
} from "../../../../graph/knowledge/primitive/entity";
import { bpMultiFilterToGraphFilter } from "../../../../graph/knowledge/primitive/entity/query";
import {
  createLinkEntity,
  isEntityLinkEntity,
  updateLinkEntity,
} from "../../../../graph/knowledge/primitive/link-entity";
import {
  AccountGroupAuthorizationSubjectRelation,
  AuthorizationSubjectKind,
  AuthorizationViewerInput,
  EntityAuthorizationRelation,
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
  QueryGetEntityArgs,
  QueryIsEntityPublicArgs,
  QueryResolvers,
  QueryStructuralQueryEntitiesArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapEntityToGQL } from "../graphql-mapping";
import { createSubgraphAndPermissionsReturn } from "../shared/create-subgraph-and-permissions-return";

export const createEntityResolver: ResolverFn<
  Promise<Entity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  { ownedById, properties, entityTypeId, linkedEntities, linkData, draft },
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

    const [leftEntity, rightEntity] = await Promise.all([
      getLatestEntityById(context, authentication, {
        entityId: leftEntityId,
        includeDrafts: draft ?? false,
      }),
      getLatestEntityById(context, authentication, {
        entityId: rightEntityId,
        includeDrafts: draft ?? false,
      }),
    ]);

    entity = await createLinkEntity(context, authentication, {
      leftEntityId: leftEntity.metadata.recordId.entityId,
      leftToRightOrder: leftToRightOrder ?? undefined,
      rightEntityId: rightEntity.metadata.recordId.entityId,
      rightToLeftOrder: rightToLeftOrder ?? undefined,
      properties,
      linkEntityTypeId: entityTypeId,
      ownedById: ownedById ?? (user.accountId as OwnedById),
      relationships: createDefaultAuthorizationRelationships(authentication),
      draft: draft ?? undefined,
    });
  } else {
    entity = await createEntityWithLinks(context, authentication, {
      ownedById: ownedById ?? (user.accountId as OwnedById),
      entityTypeId,
      properties,
      linkedEntities: linkedEntities ?? undefined,
      relationships: createDefaultAuthorizationRelationships(authentication),
      draft: draft ?? undefined,
    });
  }

  return mapEntityToGQL(entity);
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
  { logger, dataSources, authentication },
  info,
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
      includeDrafts: includeDrafts ?? false,
    },
  });

  return createSubgraphAndPermissionsReturn(
    { dataSources, authentication },
    info,
    entitySubgraph,
  );
};

export const structuralQueryEntitiesResolver: ResolverFn<
  Query["structuralQueryEntities"],
  Record<string, never>,
  GraphQLContext,
  QueryStructuralQueryEntitiesArgs
> = async (_, { query }, context, info) => {
  const subgraph = await getEntities(
    context.dataSources,
    context.authentication,
    {
      query,
    },
  );

  return createSubgraphAndPermissionsReturn(context, info, subgraph);
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
  { dataSources, authentication },
  info,
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
      includeDrafts: includeDrafts ?? false,
    },
  });

  return createSubgraphAndPermissionsReturn(
    { dataSources, authentication },
    info,
    entitySubgraph,
  );
};

export const updateEntityResolver: ResolverFn<
  Promise<Entity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdateEntityArgs
> = async (
  _,
  {
    entityUpdate: {
      draft,
      entityId,
      updatedProperties,
      leftToRightOrder,
      rightToLeftOrder,
      entityTypeId,
    },
  },
  { dataSources, authentication, user },
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

  const entity = await getLatestEntityById(context, authentication, {
    entityId,
    includeDrafts: true,
  });

  let updatedEntity: Entity;

  if (isEntityLinkEntity(entity)) {
    updatedEntity = await updateLinkEntity(context, authentication, {
      linkEntity: entity,
      properties: updatedProperties,
      leftToRightOrder: leftToRightOrder ?? undefined,
      rightToLeftOrder: rightToLeftOrder ?? undefined,
      draft: draft ?? undefined,
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
      draft: draft ?? undefined,
    });
  }

  return mapEntityToGQL(updatedEntity);
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

export const archiveEntityResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveEntityArgs
> = async (_, { entityId }, { dataSources: context, authentication }) => {
  const entity = await getLatestEntityById(context, authentication, {
    entityId,
    includeDrafts: true,
  });

  await archiveEntity(context, authentication, { entity });

  return true;
};

export const archiveEntitiesResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationArchiveEntitiesArgs
> = async (_, { entityIds }, { dataSources: context, authentication }) => {
  const archivedEntities: Entity[] = [];

  const entitiesThatCouldNotBeArchived: EntityId[] = [];

  await Promise.all(
    entityIds.map(async (entityId) => {
      try {
        const entity = await getLatestEntityById(context, authentication, {
          entityId,
          includeDrafts: true,
        });

        await archiveEntity(context, authentication, { entity });

        archivedEntities.push(entity);
      } catch (error) {
        entitiesThatCouldNotBeArchived.push(entityId);
      }
    }),
  );

  if (entitiesThatCouldNotBeArchived.length > 0) {
    await Promise.all(
      archivedEntities.map((entity) =>
        unarchiveEntity(context, authentication, { entity }),
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
> = async (_, { entityId, owner }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

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
> = async (_, { entityId, owner }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

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
> = async (_, { entityId, editor }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  await addEntityEditor(context, authentication, { entityId, editor });

  return true;
};

export const removeEntityEditorResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationRemoveEntityEditorArgs
> = async (_, { entityId, editor }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

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
    return { kind: "account", subjectId: viewer as AccountId } as const;
  } else {
    if (!viewer) {
      throw new UserInputError("Viewer Account Group ID must be specified");
    }
    return {
      kind: "accountGroup",
      subjectId: viewer as AccountGroupId,
    } as const;
  }
};

export const addEntityViewerResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationAddEntityViewerArgs
> = async (_, { entityId, viewer }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

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
> = async (_, { entityId, viewer }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

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
> = async (_, { entityId }, { dataSources }) =>
  checkEntityPermission(
    dataSourcesToImpureGraphContext(dataSources),
    { actorId: publicUserAccountId },
    { entityId, permission: "view" },
  );

export const getEntityAuthorizationRelationshipsResolver: ResolverFn<
  EntityAuthorizationRelationship[],
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryIsEntityPublicArgs
> = async (_, { entityId }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const relationships = await getEntityAuthorizationRelationships(
    context,
    authentication,
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
