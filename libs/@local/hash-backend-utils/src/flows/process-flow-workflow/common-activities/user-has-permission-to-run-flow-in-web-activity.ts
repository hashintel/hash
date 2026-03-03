import type { ActorEntityUuid, WebId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";

export type UserHasPermissionToRunFlowInWebActivityParams = {
  userAuthentication: { actorId: ActorEntityUuid };
  webId: WebId;
};

/**
 * Check whether a user has permission to run a flow in a web, which
 * requires the user to have permission to:
 * - create entities in the web
 */
export const userHasPermissionToRunFlowInWebActivity = async (
  params: UserHasPermissionToRunFlowInWebActivityParams & {
    graphApiClient: GraphApi;
  },
): Promise<
  | {
      status: "ok";
    }
  | {
      status: "not-role-in-web";
      errorMessage: string;
    }
> => {
  const { graphApiClient, userAuthentication, webId } = params;

  const webRole = await getActorGroupRole(graphApiClient, userAuthentication, {
    actorId: userAuthentication.actorId,
    actorGroupId: webId,
  });

  if (!webRole) {
    return {
      status: "not-role-in-web",
      errorMessage: "User is not assigned to any role in the web",
    };
  }

  return { status: "ok" };
};
