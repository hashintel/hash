import type { ActorEntityUuid, WebId } from "@blockprotocol/type-system";
import {
  getMachineIdByIdentifier,
  getWebMachineId,
} from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";

export const getAiAssistantAccountIdActivity = async (params: {
  authentication: { actorId: ActorEntityUuid };
  grantCreatePermissionForWeb?: WebId;
  graphApiClient: GraphApi;
}): Promise<ActorEntityUuid | null> => {
  const { authentication, graphApiClient, grantCreatePermissionForWeb } =
    params;

  const aiAssistantAccountId = await getMachineIdByIdentifier(
    { graphApi: graphApiClient },
    authentication,
    { identifier: "hash-ai" },
  );
  if (!aiAssistantAccountId) {
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
      const webMachineActorId = await getWebMachineId(
        { graphApi: graphApiClient },
        authentication,
        { webId: grantCreatePermissionForWeb },
      ).then((maybeMachineId) => {
        if (!maybeMachineId) {
          throw new Error(
            `Failed to get web machine for web ID: ${grantCreatePermissionForWeb}`,
          );
        }
        return maybeMachineId;
      });

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
