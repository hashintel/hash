import { queryEntities } from "@local/hash-graph-sdk/entity";
import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { ActorEntityUuid, WebId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";

export type UserHasPermissionToRunFlowInWebActivityParams = {
  /** Whether the flow uses AI actions, which only users with the `ai` feature flag can run. */
  requiresAiFeatureFlag: boolean;
  userAuthentication: { actorId: ActorEntityUuid };
  webId: WebId;
};

const userHasAiFeatureFlag = async (
  graphApiClient: GraphApi,
  userAuthentication: { actorId: ActorEntityUuid },
) => {
  const { actorId } = userAuthentication;

  /* A user's entity is in their own web, and has their id as its uuid. */
  const {
    entities: [userEntity],
  } = await queryEntities({ graphApi: graphApiClient }, userAuthentication, {
    filter: {
      all: [
        { equal: [{ path: ["webId"] }, { parameter: actorId }] },
        { equal: [{ path: ["uuid"] }, { parameter: actorId }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: false,
    includePermissions: false,
  });

  const enabledFeatureFlags =
    userEntity?.properties[
      systemPropertyTypes.enabledFeatureFlags.propertyTypeBaseUrl
    ];

  return (
    Array.isArray(enabledFeatureFlags) && enabledFeatureFlags.includes("ai")
  );
};

/**
 * Check whether a user has permission to run a flow in a web, which
 * requires the user to have permission to:
 * - create entities in the web
 * - run AI flows, if the flow uses AI actions
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
      status: "not-role-in-web" | "ai-not-enabled";
      errorMessage: string;
    }
> => {
  const { graphApiClient, requiresAiFeatureFlag, userAuthentication, webId } =
    params;

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

  if (
    requiresAiFeatureFlag &&
    !(await userHasAiFeatureFlag(graphApiClient, userAuthentication))
  ) {
    return {
      status: "ai-not-enabled",
      errorMessage: "AI flows are not enabled for the user",
    };
  }

  return { status: "ok" };
};
