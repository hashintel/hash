import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";

import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";

/**
 * Check whether a user has permission to run a flow in a web, which
 * requires the user to have permission to:
 * - create entities in the web
 */
export const userHasPermissionToRunFlowInWebActivity = async (): Promise<
  | {
      status: "ok";
    }
  | {
      status: "missing-permission";
      missingPermissions: "create_entity"[];
    }
> => {
  const { userAuthentication, webId } = await getFlowContext();

  const webRole = await getActorGroupRole(graphApiClient, userAuthentication, {
    actorId: userAuthentication.actorId,
    actorGroupId: webId,
  });

  if (!webRole) {
    return {
      status: "missing-permission",
      missingPermissions: ["create_entity"],
    };
  }

  return { status: "ok" };
};
