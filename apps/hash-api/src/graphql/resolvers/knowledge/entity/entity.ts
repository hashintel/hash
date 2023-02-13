import { Filter } from "@local/hash-graph-client";
import {
  Entity,
  isEntityId,
  OwnedById,
  splitEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { mapSubgraph } from "@local/hash-subgraph/temp";
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
  QueryGetAllLatestEntitiesArgs,
  QueryGetEntityArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapEntityToGQL } from "../graphql-mapping";
import { beforeUpdateEntityHooks } from "./before-update-entity-hooks";

/**
 * @todo - Remove this when the Subgraph is appropriately queryable for a timestamp
 *   at the moment, (not in the roots) all versions of linked entities are returned,
 *   and with the lack of an `endTime`, this breaks the query ability of the graph to
 *   find the correct version of an entity.
 *   https://app.asana.com/0/1201095311341924/1203331904553375/f
 *
 */
const removeNonLatestEntities = (subgraph: Subgraph) => {
  for (const entityId of Object.keys(subgraph.vertices)) {
    if (isEntityId(entityId)) {
      for (const oldVersion of Object.keys(subgraph.vertices[entityId]!)
        .sort()
        .slice(0, -1)) {
        /* @ts-expect-error -- @todo-0.3 This is temporary and due to the `Vertices` and `Edges` objects not being migrated yet */
        // eslint-disable-next-line no-param-reassign
        delete subgraph.vertices[entityId]![oldVersion];
      }
    }
  }
};

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

export const getAllLatestEntitiesResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestEntitiesArgs
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
          { path: ["type", "versionedUri"] },
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
    timeProjection: {
      kernel: {
        axis: "transaction",
        timestamp: null,
      },
      image: {
        axis: "decision",
        start: null,
        end: null,
      },
    },
  });

  const mappedSubgraph = mapSubgraph(entitySubgraph);
  removeNonLatestEntities(mappedSubgraph);
  return mappedSubgraph;
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
    timeProjection: {
      kernel: {
        axis: "transaction",
        timestamp: null,
      },
      image: {
        axis: "decision",
        start: entityVersion
          ? { bound: "included", timestamp: entityVersion }
          : null,
        end: entityVersion
          ? { bound: "included", timestamp: entityVersion }
          : null,
      },
    },
  });

  const mappedSubgraph = mapSubgraph(entitySubgraph);
  removeNonLatestEntities(mappedSubgraph);
  return mappedSubgraph;
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
