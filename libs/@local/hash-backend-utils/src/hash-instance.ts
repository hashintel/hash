import {
  EntityTypeMismatchError,
  NotFoundError,
} from "@local/hash-backend-utils/error";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  AccountGroupId,
  AccountId,
} from "@local/hash-graph-types/account";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  HASHInstance,
  HASHInstance as HASHInstanceEntity,
  HASHInstanceProperties,
} from "@local/hash-isomorphic-utils/system-types/hashinstance";

export type HashInstance = {
  entity: Entity<HASHInstance>;
} & SimpleProperties<HASHInstanceProperties>;

export const getHashInstanceFromEntity = ({
  entity,
}: {
  entity: Entity<HASHInstanceEntity>;
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
    ...simplifyProperties(entity.properties),
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
    .getEntities(actorId, {
      filter: generateVersionedUrlMatchingFilter(
        systemEntityTypes.hashInstance.entityTypeId,
        { ignoreParents: true },
      ),
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity<HASHInstanceEntity>(entity, actorId),
      ),
    );

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
) => {
  // console.info(`[${userAccountId}] Fetching HASH Instance entity`);
  const hashInstance = await getHashInstance(ctx, authentication).catch(
    (err) => {
      // eslint-disable-next-line no-console
      console.error(
        `[${userAccountId}] ERROR Fetching HASH Instance entity: ${err}`,
      );
      throw err;
    },
  );
  // console.info(`[${userAccountId}] SUCCESS Fetching HASH Instance entity`);
  // console.info(`[${userAccountId}] Checking permission on instance`);
  return ctx.graphApi
    .checkEntityPermission(
      userAccountId,
      hashInstance.entity.metadata.recordId.entityId,
      "update",
    )
    .then(({ data }) => {
      // console.info(
      //   `[${userAccountId}] SUCCESS Checking permission on instance`,
      // );
      return data.has_permission;
    })
    .catch((err) => {
      // console.error(
      //   `[${userAccountId}] ERROR Checking permission on instance: ${err}`,
      // );
      throw err;
    });
};

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
