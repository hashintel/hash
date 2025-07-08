import type { ActorEntityUuid, AiId, WebId } from "@blockprotocol/type-system";
import { getAiIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";

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

  if (grantCreatePermissionForWeb) {
    await graphApiClient.assignActorGroupRole(
      authentication.actorId,
      grantCreatePermissionForWeb,
      "member",
      aiAssistantAccountId,
    );
  }

  return aiAssistantAccountId;
};
