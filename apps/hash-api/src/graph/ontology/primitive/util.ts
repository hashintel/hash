import {
  ModifyRelationshipOperation,
  WebPermission,
} from "@local/hash-graph-client";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
  Uuid,
  WebAuthorizationRelationship,
} from "@local/hash-subgraph";

import { ImpureGraphFunction } from "../../context-types";
import { getOrgById } from "../../knowledge/system-types/org";
import { getUserById } from "../../knowledge/system-types/user";

/**
 * Get the web shortname of an account or account group by its id
 */
export const getWebShortname: ImpureGraphFunction<
  {
    accountOrAccountGroupId: OwnedById;
  },
  Promise<string>
> = async (ctx, authentication, params) => {
  const namespace = (
    (await getUserById(ctx, authentication, {
      entityId: entityIdFromOwnedByIdAndEntityUuid(
        params.accountOrAccountGroupId as Uuid as OwnedById,
        params.accountOrAccountGroupId as Uuid as EntityUuid,
      ),
    }).catch(() => undefined)) ??
    (await getOrgById(ctx, authentication, {
      entityId: entityIdFromOwnedByIdAndEntityUuid(
        params.accountOrAccountGroupId as Uuid as OwnedById,
        params.accountOrAccountGroupId as Uuid as EntityUuid,
      ),
    }).catch(() => undefined))
  )?.shortname;

  if (!namespace) {
    throw new Error(
      `failed to get namespace for owner: ${params.accountOrAccountGroupId}`,
    );
  }

  return namespace;
};

export const getWebAuthorizationRelationships: ImpureGraphFunction<
  { ownedById: OwnedById },
  Promise<WebAuthorizationRelationship[]>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .getWebAuthorizationRelationships(actorId, params.ownedById)
    .then(({ data }) =>
      data.map(
        (relationship) =>
          ({
            resource: { kind: "web", resourceId: params.ownedById },
            ...relationship,
          }) as WebAuthorizationRelationship,
      ),
    );

export const modifyWebAuthorizationRelationships: ImpureGraphFunction<
  {
    operation: ModifyRelationshipOperation;
    relationship: WebAuthorizationRelationship;
  }[],
  Promise<void>
> = async ({ graphApi }, { actorId }, params) => {
  await graphApi.modifyWebAuthorizationRelationships(
    actorId,
    params.map(({ operation, relationship }) => ({
      operation,
      resource: relationship.resource.resourceId,
      relationAndSubject: relationship,
    })),
  );
};

export const checkWebPermission: ImpureGraphFunction<
  { ownedById: OwnedById; permission: WebPermission },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .checkWebPermission(actorId, params.ownedById, params.permission)
    .then(({ data }) => data.has_permission);
