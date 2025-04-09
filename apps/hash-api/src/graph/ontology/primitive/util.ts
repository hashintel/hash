import type {
  ActorEntityUuid,
  ActorGroupId,
  EntityUuid,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import type {
  ModifyRelationshipOperation,
  WebPermission,
} from "@local/hash-graph-client";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import type { WebAuthorizationRelationship } from "@local/hash-subgraph";

import type { ImpureGraphFunction } from "../../context-types";
import { getOrgById } from "../../knowledge/system-types/org";
import { getUserById } from "../../knowledge/system-types/user";

export const isExternalTypeId = (typeId: VersionedUrl) =>
  !typeId.startsWith(frontendUrl) &&
  // To be removed in H-1172: Temporary provision to serve types with a https://hash.ai URL from https://app.hash.ai
  !(
    !isSelfHostedInstance &&
    ["https://app.hash.ai", "http://localhost:3000"].includes(frontendUrl) &&
    new URL(typeId).hostname === "hash.ai"
  );

/**
 * Get the web shortname of an account or account group by its id
 */
export const getWebShortname: ImpureGraphFunction<
  {
    accountOrAccountGroupId: WebId;
  },
  Promise<string>
> = async (ctx, authentication, params) => {
  const namespace = (
    (await getUserById(ctx, authentication, {
      entityId: entityIdFromComponents(
        params.accountOrAccountGroupId as ActorEntityUuid as WebId,
        params.accountOrAccountGroupId as ActorEntityUuid,
      ),
    }).catch(() => undefined)) ??
    (await getOrgById(ctx, authentication, {
      entityId: entityIdFromComponents(
        params.accountOrAccountGroupId as ActorGroupId as WebId,
        params.accountOrAccountGroupId as string as EntityUuid,
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
  { webId: WebId },
  Promise<WebAuthorizationRelationship[]>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .getWebAuthorizationRelationships(actorId, params.webId)
    .then(({ data }) =>
      data.map(
        (relationship) =>
          ({
            resource: { kind: "web", resourceId: params.webId },
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
  { webId: WebId; permission: WebPermission },
  Promise<boolean>
> = async ({ graphApi }, { actorId }, params) =>
  graphApi
    .checkWebPermission(actorId, params.webId, params.permission)
    .then(({ data }) => data.has_permission);
