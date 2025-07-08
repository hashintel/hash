import type { ActorEntityUuid, AiId, WebId } from "@blockprotocol/type-system";
import { getAiIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";
import { addActorGroupMember } from "@local/hash-graph-sdk/principal/actor-group";

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
    await addActorGroupMember(graphApiClient, authentication, {
      actorId: aiAssistantAccountId,
      actorGroupId: grantCreatePermissionForWeb,
    });
  }

  return aiAssistantAccountId;
};
