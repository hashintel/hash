import type { ActorEntityUuid, Team, WebId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";
import { getTeamByName } from "@local/hash-graph-sdk/principal/team";
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
import { backOff } from "exponential-backoff";

import { EntityTypeMismatchError, NotFoundError } from "./error.js";

export type HashInstance = {
  entity: HashEntity<HASHInstance>;
} & SimpleProperties<HASHInstanceProperties>;

export const getInstanceAdminsTeam = async (
  ctx: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
): Promise<Omit<Team, "parentId"> & { webId: WebId }> =>
  getTeamByName(ctx.graphApi, authentication, "instance-admins").then(
    (team) => {
      if (!team) {
        throw new NotFoundError("Failed to get instance admins team");
      }
      if (team.parentId.actorGroupType !== "web") {
        throw new Error("Instance admins parent is not a web");
      }
      return {
        ...team,
        webId: team.parentId.id,
      };
    },
  );

export const getHashInstanceFromEntity = ({
  entity,
}: {
  entity: HashEntity<HASHInstanceEntity>;
}): HashInstance => {
  if (
    !entity.metadata.entityTypeIds.includes(
      systemEntityTypes.hashInstance.entityTypeId,
    )
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.hashInstance.entityTypeId,
      entity.metadata.entityTypeIds,
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
  { actorId }: { actorId: ActorEntityUuid },
): Promise<HashInstance> => {
  const entities = await backOff(
    () =>
      graphApi
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
        ),
    {
      numOfAttempts: 3,
      startingDelay: 1_000,
      jitter: "full",
    },
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
  authentication: { actorId: ActorEntityUuid },
  { userAccountId }: { userAccountId: ActorEntityUuid },
): Promise<boolean> =>
  getInstanceAdminsTeam(ctx, authentication).then((team) =>
    getActorGroupRole(ctx.graphApi, authentication, {
      actorGroupId: team.id,
      actorId: userAccountId,
    }).then((role) => role === "member"),
  );
