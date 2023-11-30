import { Filter, QueryTemporalAxesUnresolved } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountGroupId,
  AccountId,
  Entity,
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
  addEntityEditor,
  addEntityOwner,
  archiveEntity,
  checkEntityPermission,
  createEntityWithLinks,
  getEntities,
  getEntityAuthorizationRelationships,
  getLatestEntityById,
  modifyEntityAuthorizationRelationships,
  removeEntityEditor,
  removeEntityOwner,
  updateEntity,
} from "../../../../graph/knowledge/primitive/entity";
import { bpMultiFilterToGraphFilter } from "../../../../graph/knowledge/primitive/entity/query";
import {
  createLinkEntity,
  isEntityLinkEntity,
  updateLinkEntity,
} from "../../../../graph/knowledge/primitive/link-entity";
import { modifyWebAuthorizationRelationships } from "../../../../graph/ontology/primitive/util";
import { systemAccountId } from "../../../../graph/system-account";
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

    const [leftEntity, rightEntity] = await Promise.all([
      getLatestEntityById(context, authentication, {
        entityId: leftEntityId,
      }),
      getLatestEntityById(context, authentication, {
        entityId: rightEntityId,
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
  {},
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
  });

  let updatedEntity: Entity;

  const { shortname, preferredName } = simplifyProperties(
    updatedProperties as UserProperties,
  );

  if (isIncompleteUser && shortname && preferredName) {
    // Now that the user has completed signup, we can transfer the ownership of the web
    // allowing them to create entities and types.
    await modifyWebAuthorizationRelationships(
      context,
      { actorId: systemAccountId },
      [
        {
          operation: "delete",
          relationship: {
            subject: {
              kind: "account",
              subjectId: systemAccountId,
            },
            resource: {
              kind: "web",
              resourceId: user.accountId as OwnedById,
            },
            relation: "owner",
          },
        },
        {
          operation: "create",
          relationship: {
            subject: {
              kind: "account",
              subjectId: user.accountId,
            },
            resource: {
              kind: "web",
              resourceId: user.accountId as OwnedById,
            },
            relation: "owner",
          },
        },
      ],
    );
  }

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

export const addEntityOwnerResolver: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationAddEntityOwnerArgs
> = async (_, { entityId, owner }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  await addEntityOwner(context, authentication, { entityId, owner });

  return true;
};

export const removeEntityOwnerResolver: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationRemoveEntityOwnerArgs
> = async (_, { entityId, owner }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  await removeEntityOwner(context, authentication, { entityId, owner });

  return true;
};

export const addEntityEditorResolver: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationAddEntityEditorArgs
> = async (_, { entityId, editor }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  await addEntityEditor(context, authentication, { entityId, editor });

  return true;
};

export const removeEntityEditorResolver: ResolverFn<
  Promise<boolean>,
  {},
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
  {},
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
  {},
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
  {},
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
  {},
  LoggedInGraphQLContext,
  QueryIsEntityPublicArgs
> = async (_, { entityId }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const relationships = await getEntityAuthorizationRelationships(
    context,
    authentication,
    { entityId },
  );

  // TODO: Align definitions with the ones in the API
  return relationships.map(({ resource, relation, subject }) => ({
    objectEntityId: resource.resourceId,
    relation:
      relation === "editor"
        ? EntityAuthorizationRelation.Editor
        : relation === "owner"
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
