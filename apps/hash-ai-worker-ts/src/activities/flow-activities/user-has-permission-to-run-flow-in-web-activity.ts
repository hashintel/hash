import { getFlowContext } from "../shared/get-flow-context";
import { graphApiClient } from "../shared/graph-api-client";

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

  const {
    data: { has_permission: canCreateEntities },
  } = await graphApiClient.checkWebPermission(
    userAuthentication.actorId,
    webId,
    "create_entity",
  );

  if (!canCreateEntities) {
    return {
      status: "missing-permission",
      missingPermissions: ["create_entity"],
    };
  }

  return { status: "ok" };
};
