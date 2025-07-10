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
      status: "not-role-in-web";
      errorMessage: string;
    }
> => {
  const { userAuthentication, webId } = await getFlowContext();

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
