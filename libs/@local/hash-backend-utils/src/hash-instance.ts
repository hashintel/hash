import {
  EntityTypeMismatchError,
  NotFoundError,
} from "@local/hash-backend-utils/error";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { HASHInstanceProperties } from "@local/hash-isomorphic-utils/system-types/hashinstance";
import type {
  AccountGroupId,
  AccountId,
  Entity,
  EntityRootType,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

export type HashInstance = {
  entity: Entity;
} & SimpleProperties<HASHInstanceProperties>;

export const getHashInstanceFromEntity = ({
  entity,
}: {
  entity: Entity;
}): HashInstance => {
  if (
    entity.metadata.entityTypeId !== systemEntityTypes.hashInstance.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.hashInstance.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  return {
    ...simplifyProperties(entity.properties as HASHInstanceProperties),
    entity,
  };
};

/**
 * Get the hash instance.
 */
export const getHashInstance = async (
  { graphApi }: { graphApi: GraphApi },
  { actorId }: { actorId: AccountId },
): Promise<HashInstance> => {
  const entities = await graphApi
    .getEntitiesByQuery(actorId, {
      query: {
        filter: generateVersionedUrlMatchingFilter(
          systemEntityTypes.hashInstance.entityTypeId,
          { ignoreParents: true },
        ),
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
        actorId,
      );

      return getRoots(subgraph);
    });

  if (entities.length > 1) {
    throw new Error("More than one hash instance entity found in the graph.");
  }

  const entity = entities[0];

  if (!entity) {
    throw new NotFoundError("Could not find hash instance entity.");
  }

  return getHashInstanceFromEntity({ entity });
};

/**
 * Check whether or not the user is a hash instance admin.
 *
 * @param params.user - the user that may be a hash instance admin.
 */
export const isUserHashInstanceAdmin = async (
  ctx: { graphApi: GraphApi },
  authentication: { actorId: AccountId },
  { userAccountId }: { userAccountId: AccountId },
) =>
  getHashInstance(ctx, authentication).then((hashInstance) =>
    ctx.graphApi
      .checkEntityPermission(
        userAccountId,
        hashInstance.entity.metadata.recordId.entityId,
        "update",
      )
      .then(({ data }) => data.has_permission),
  );

/**
 * Retrieves the accountGroupId of the instance admin account group.
 */
export const getHashInstanceAdminAccountGroupId = async (
  ctx: { graphApi: GraphApi },
  authentication: { actorId: AccountId },
): Promise<AccountGroupId> => {
  const hashInstance = await getHashInstance(ctx, authentication);

  const systemAccountId = await getMachineActorId(
    { graphApi: ctx.graphApi },
    authentication,
    { identifier: "hash" },
  );

  const entityPermissions = await ctx.graphApi
    .getEntityAuthorizationRelationships(
      systemAccountId,
      hashInstance.entity.metadata.recordId.entityId,
    )
    .then((resp) => resp.data);

  const entityAdmin = entityPermissions.find(
    (permission) => permission.relation === "administrator",
  )?.subject;

  if (!entityAdmin || !("subjectId" in entityAdmin)) {
    throw new Error("No administrator role over HASH Instance entity.");
  }

  if (entityAdmin.kind !== "accountGroup") {
    throw new Error(
      `HASH Instance entity administrator is a ${entityAdmin.kind}, expected accountGroup`,
    );
  }

  return entityAdmin.subjectId as AccountGroupId;
};
