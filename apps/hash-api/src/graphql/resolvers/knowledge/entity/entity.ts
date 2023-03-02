import { Filter } from "@local/hash-graph-client";
import {
  Entity,
  EntityRootType,
  OwnedById,
  splitEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { ForbiddenError, UserInputError } from "apollo-server-express";

import {
  archiveEntity,
  createEntityWithLinks,
  getLatestEntityById,
  updateEntity,
} from "../../../../graph/knowledge/primitive/entity";
import {
  createLinkEntity,
  isEntityLinkEntity,
  LinkEntity,
  updateLinkEntity,
} from "../../../../graph/knowledge/primitive/link-entity";
import { getEntityTypeById } from "../../../../graph/ontology/primitive/entity-type";
import {
  MutationArchiveEntityArgs,
  MutationCreateEntityArgs,
  MutationUpdateEntityArgs,
  QueryGetEntityArgs,
  QueryQueryEntitiesArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
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
  { dataSources, user },
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
      getLatestEntityById(context, {
        entityId: leftEntityId,
      }),
      getLatestEntityById(context, {
        entityId: rightEntityId,
      }),
      getEntityTypeById(context, { entityTypeId }),
    ]);

    entity = await createLinkEntity(context, {
      leftEntityId: leftEntity.metadata.recordId.entityId,
      leftToRightOrder: leftToRightOrder ?? undefined,
      rightEntityId: rightEntity.metadata.recordId.entityId,
      rightToLeftOrder: rightToLeftOrder ?? undefined,
      properties,
      linkEntityType,
      ownedById: ownedById ?? (user.accountId as OwnedById),
      actorId: user.accountId,
    });
  } else {
    entity = await createEntityWithLinks(context, {
      ownedById: ownedById ?? (user.accountId as OwnedById),
      entityTypeId,
      properties,
      linkedEntities: linkedEntities ?? undefined,
      actorId: user.accountId,
    });
  }

  return mapEntityToGQL(entity);
};

export const queryEntitiesResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryQueryEntitiesArgs
> = async (
  _,
  {
    rootEntityTypeIds,
    constrainsValuesOn,
    constrainsPropertiesOn,
    constrainsLinksOn,
    constrainsLinkDestinationsOn,
    isOfType,
    hasLeftEntity,
    hasRightEntity,
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;

  const filter: Filter = {
    all: [
      {
        equal: [{ path: ["archived"] }, { parameter: false }],
      },
    ],
  };

  if (rootEntityTypeIds && rootEntityTypeIds.length > 0) {
    filter.all.push({
      any: rootEntityTypeIds.map((entityTypeId) => ({
        equal: [
          { path: ["type", "versionedUrl"] },
          { parameter: entityTypeId },
        ],
      })),
    });
  }

  const { data: entitySubgraph } = await graphApi.getEntitiesByQuery({
    filter,
    graphResolveDepths: {
      inheritsFrom: { outgoing: 0 },
      constrainsValuesOn,
      constrainsPropertiesOn,
      constrainsLinksOn,
      constrainsLinkDestinationsOn,
      isOfType,
      hasLeftEntity,
      hasRightEntity,
    },
    temporalAxes: {
      pinned: {
        axis: "transactionTime",
        timestamp: null,
      },
      variable: {
        axis: "decisionTime",
        interval: {
          start: null,
          end: null,
        },
      },
    },
  });

  return entitySubgraph as Subgraph<EntityRootType>;
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
    isOfType,
    hasLeftEntity,
    hasRightEntity,
  },
  { dataSources },
  __,
) => {
  const { graphApi } = dataSources;
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

  const { data: entitySubgraph } = await graphApi.getEntitiesByQuery({
    filter,
    graphResolveDepths: {
      inheritsFrom: { outgoing: 0 },
      constrainsValuesOn,
      constrainsPropertiesOn,
      constrainsLinksOn,
      constrainsLinkDestinationsOn,
      isOfType,
      hasLeftEntity,
      hasRightEntity,
    },
    temporalAxes: {
      pinned: {
        axis: "transactionTime",
        timestamp: null,
      },
      variable: {
        axis: "decisionTime",
        interval: {
          start: entityVersion
            ? { kind: "inclusive", limit: entityVersion }
            : null,
          end: entityVersion
            ? { kind: "inclusive", limit: entityVersion }
            : null,
        },
      },
    },
  });

  return entitySubgraph as Subgraph<EntityRootType>;
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
  { dataSources, user },
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

  const entity = await getLatestEntityById(context, { entityId });

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
    updatedEntity = await updateLinkEntity(context, {
      linkEntity: entity,
      properties: updatedProperties,
      actorId: user.accountId,
      leftToRightOrder: leftToRightOrder ?? undefined,
      rightToLeftOrder: rightToLeftOrder ?? undefined,
    });
  } else {
    if (leftToRightOrder || rightToLeftOrder) {
      throw new UserInputError(
        `Cannot update the left to right order or right to left order of entity with ID ${entity.metadata.recordId.entityId} because it isn't a link.`,
      );
    }

    updatedEntity = await updateEntity(context, {
      entity,
      entityTypeId: entityTypeId ?? undefined,
      properties: updatedProperties,
      actorId: user.accountId,
    });
  }

  return mapEntityToGQL(updatedEntity);
};

export const archiveEntityResolver: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationArchiveEntityArgs
> = async (_, { entityId }, { dataSources: context, user }) => {
  const entity = await getLatestEntityById(context, { entityId });

  await archiveEntity(context, { entity, actorId: user.accountId });

  return true;
};
