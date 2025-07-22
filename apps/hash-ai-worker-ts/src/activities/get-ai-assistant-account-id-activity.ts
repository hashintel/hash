import type { ActorEntityUuid, AiId, WebId } from "@blockprotocol/type-system";
import { getAiIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";
import {
  addActorGroupMember,
  getActorGroupRole,
} from "@local/hash-graph-sdk/principal/actor-group";

export const getAiAssistantAccountIdActivity = async (params: {
  authentication: { actorId: ActorEntityUuid };
  grantCreatePermissionForWeb?: WebId;
  graphApiClient: GraphApi;
}): Promise<AiId | null> => {
  const { authentication, graphApiClient, grantCreatePermissionForWeb } =
    params;

  const aiAssistantAccountId = await getAiIdByIdentifier(
    { graphApi: graphApiClient },
    authentication,
    { identifier: "hash-ai" },
  );
  if (!aiAssistantAccountId) {
    return null;
  }

  // TODO: We want to add a toggle in the web settings to allow the AI assistant to be a member of the web.
  //       With that, this branch can be removed.
  //   see https://linear.app/hash/issue/H-4972/add-toggle-in-org-settings-to-enable-ai-flows-in-a-web
  if (grantCreatePermissionForWeb) {
    const webRole = await getActorGroupRole(graphApiClient, authentication, {
      actorId: aiAssistantAccountId,
      actorGroupId: grantCreatePermissionForWeb,
    });

    // If the AI assistant is not a member of the web, we need to add them as a member.
    // This can only be done if the user is an administrator of the web.
    if (!webRole) {
      const isWebAdmin = await getActorGroupRole(
        graphApiClient,
        authentication,
        {
          actorId: authentication.actorId,
          actorGroupId: grantCreatePermissionForWeb,
        },
      ).then((role) => role === "administrator");

      if (isWebAdmin) {
        await addActorGroupMember(graphApiClient, authentication, {
          actorId: aiAssistantAccountId,
          actorGroupId: grantCreatePermissionForWeb,
        });
      }
    }
  }

  return aiAssistantAccountId;
};
