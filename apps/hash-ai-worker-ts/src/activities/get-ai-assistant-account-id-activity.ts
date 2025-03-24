import type { ActorId, OwnedById } from "@blockprotocol/type-system";
import {
  getMachineActorId,
  getWebMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";

export const getAiAssistantAccountIdActivity = async (params: {
  authentication: { actorId: ActorId };
  grantCreatePermissionForWeb?: OwnedById;
  graphApiClient: GraphApi;
}): Promise<ActorId | null> => {
  const { authentication, graphApiClient, grantCreatePermissionForWeb } =
    params;

  let aiAssistantAccountId: ActorId;

  try {
    aiAssistantAccountId = await getMachineActorId(
      { graphApi: graphApiClient },
      authentication,
      { identifier: "hash-ai" },
    );
  } catch {
    return null;
  }

  if (grantCreatePermissionForWeb) {
    const aiAssistantHasPermission = await graphApiClient
      .checkWebPermission(
        aiAssistantAccountId,
        grantCreatePermissionForWeb,
        "update_entity",
      )
      .then((resp) => resp.data.has_permission);

    if (!aiAssistantHasPermission) {
      /** The AI Assistant does not have permission in the requested web, use the web-scoped bot to grant it */
      const webMachineActorId = await getWebMachineActorId(
        { graphApi: graphApiClient },
        authentication,
        {
          ownedById: grantCreatePermissionForWeb,
        },
      );

      await graphApiClient.modifyWebAuthorizationRelationships(
        webMachineActorId,
        [
          {
            operation: "create",
            resource: grantCreatePermissionForWeb,
            relationAndSubject: {
              subject: {
                kind: "account",
                subjectId: aiAssistantAccountId,
              },
              relation: "entityCreator",
            },
          },
          {
            operation: "create",
            resource: grantCreatePermissionForWeb,
            relationAndSubject: {
              subject: {
                kind: "account",
                subjectId: aiAssistantAccountId,
              },
              relation: "entityEditor",
            },
          },
        ],
      );
    }
  }

  return aiAssistantAccountId;
};
