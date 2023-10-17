import { Filter, QueryTemporalAxesUnresolved } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  AccountGroupId,
  AccountId,
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
  addEntityEditor,
  addEntityOwner,
  addEntityViewer,
  archiveEntity,
  createEntityWithLinks,
  getEntities,
  getEntityAuthorizationRelationships,
  getLatestEntityById,
  isEntityPublic,
  removeEntityEditor,
  removeEntityOwner,
  removeEntityViewer,
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
  AuthorizationSubjectKind,
  AuthorizationViewerInput,
  EntityAuthorizationRelation,
  EntityAuthorizationRelationship,
  Mutation,
  MutationAddEntityEditorArgs,
  MutationAddEntityOwnerArgs,
  MutationAddEntityViewerArgs,
  MutationArchiveEntityArgs,
  MutationCreateEntityArgs,
  MutationInferEntitiesArgs,
  MutationRemoveEntityEditorArgs,
  MutationRemoveEntityOwnerArgs,
  MutationRemoveEntityViewerArgs,
  MutationUpdateEntityArgs,
  QueryGetEntityArgs,
  QueryIsEntityPublicArgs,
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
  QueryResolvers<LoggedInGraphQLContext>["queryEntities"],
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
  LoggedInGraphQLContext,
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
  { dataSources, authentication, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  // The user needs to be signed up if they aren't updating their own user entity
  if (
    entityId !== user.entity.metadata.recordId.entityId &&
    !user.isAccountSignupComplete
  ) {
    throw new ForbiddenError(
      "You must complete the sign-up process to perform this action.",
    );
  }

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
}: AuthorizationViewerInput): AccountId | AccountGroupId | "public" => {
  if (kind === AuthorizationSubjectKind.Public) {
    return "public" as const;
  } else if (kind === AuthorizationSubjectKind.Account) {
    if (!viewer) {
      throw new UserInputError("Viewer Account ID must be specified");
    }
    return viewer;
  } else {
    if (!viewer) {
      throw new UserInputError("Viewer Account Group ID must be specified");
    }
    return viewer;
  }
};

export const addEntityViewerResolver: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationAddEntityViewerArgs
> = async (_, { entityId, viewer }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  await addEntityViewer(context, authentication, {
    entityId,
    viewer: parseGqlAuthorizationViewerInput(viewer),
  });

  return true;
};

export const removeEntityViewerResolver: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationRemoveEntityViewerArgs
> = async (_, { entityId, viewer }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  await removeEntityViewer(context, authentication, {
    entityId,
    viewer: parseGqlAuthorizationViewerInput(viewer),
  });

  return true;
};

export const isEntityPublicResolver: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  QueryIsEntityPublicArgs
> = async (_, { entityId }, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  return await isEntityPublic(context, authentication, {
    entityId,
  });
};

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

  return relationships.map(({ object, relation, subject }) => ({
    objectEntityId: object,
    relation:
      relation === "direct_editor"
        ? EntityAuthorizationRelation.Editor
        : relation === "direct_owner"
        ? EntityAuthorizationRelation.Owner
        : EntityAuthorizationRelation.Viewer,
    subject:
      subject.type === "accountGroupMembers"
        ? { accountGroupId: subject.id as AccountGroupId }
        : subject.type === "account"
        ? { accountId: subject.id as AccountId }
        : { public: true },
  }));
};
