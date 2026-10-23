import { backOff } from "exponential-backoff";

import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";

import { getAiAssistantAccountIdActivity } from "../../get-ai-assistant-account-id-activity.js";
import { graphApiClient } from "../../shared/graph-api-client.js";

import type {
  AiId,
  MachineId,
  UserId,
  WebId,
} from "@blockprotocol/type-system";

/**
 * The bot a flow saves entities in a web as, on behalf of the user running it: the AI assistant for entities an AI
 * proposed, otherwise the web's machine.
 */
export const getSavingActorId = async ({
  actorId,
  webId,
  isAiGenerated,
}: {
  actorId: UserId;
  webId: WebId;
  isAiGenerated: boolean;
}): Promise<AiId | MachineId> => {
  const botActorId = isAiGenerated
    ? await getAiAssistantAccountIdActivity({
        authentication: { actorId },
        graphApiClient,
        grantCreatePermissionForWeb: webId,
      })
    : await getWebMachineId(
        { graphApi: graphApiClient },
        { actorId },
        { webId },
      ).then((maybeMachineId) => {
        if (!maybeMachineId) {
          throw new Error(
            `Failed to get web bot account ID for web ID: ${webId}`,
          );
        }
        return maybeMachineId;
      });

  if (!botActorId) {
    throw new Error(
      `Could not get ${isAiGenerated ? "AI" : "web"} bot for web ${webId}`,
    );
  }

  return botActorId;
};

/** Saves an entity, retrying a failed attempt twice. */
export const retrySave = <T>(save: () => Promise<T>): Promise<T> =>
  backOff(save, {
    jitter: "full",
    numOfAttempts: 3,
    startingDelay: 1_000,
  });
