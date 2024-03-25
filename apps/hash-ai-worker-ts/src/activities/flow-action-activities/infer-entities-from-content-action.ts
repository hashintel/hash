import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/step-definitions";
import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";
import type { OwnedById } from "@local/hash-subgraph/.";
import { StatusCode } from "@local/status";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity";
import { getDereferencedEntityTypesActivity } from "../get-dereferenced-entity-types-activity";
import type { InferenceState } from "../infer-entities/inference-types";
import { inferEntitiesFromWebPageActivity } from "../infer-entities-from-web-page-activity";
import type { FlowActionActivity } from "./types";

export const inferEntitiesFromContentAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, graphApiClient, userAuthentication }) => {
  const contentInput = inputs.find(
    ({ inputName }) =>
      inputName ===
      ("content" satisfies InputNameForAction<"inferEntitiesFromContent">),
  )!;

  const content = contentInput.payload.value as WebPage | string;

  if (typeof content === "string") {
    return {
      code: StatusCode.Unimplemented,
      message:
        "Text `content` input is not yet supported by the `inferEntitiesFromContent` action.",
      contents: [],
    };
  }

  const entityTypeIdsInput = inputs.find(
    ({ inputName }) =>
      inputName ===
      ("entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">),
  );

  const entityTypeIds = entityTypeIdsInput!.payload.value as VersionedUrl[];

  const aiAssistantAccountId = await getAiAssistantAccountIdActivity({
    authentication: userAuthentication,
    /**
     * @todo: we probably want this customizable by an input for the action, or
     * as an additional parameter for the activity.
     */
    grantCreatePermissionForWeb: userAuthentication.actorId as OwnedById,
    graphApiClient,
  });

  if (!aiAssistantAccountId) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: "Could not retrieve hash-ai entity",
    };
  }

  const entityTypes = await getDereferencedEntityTypesActivity({
    entityTypeIds,
    graphApiClient,
    actorId: aiAssistantAccountId,
  });

  const webPageInferenceState: InferenceState = {
    iterationCount: 1,
    inProgressEntityIds: [],
    proposedEntitySummaries: [],
    proposedEntityCreationsByType: {},
    resultsByTemporaryId: {},
    usage: [],
  };

  const status = await inferEntitiesFromWebPageActivity({
    graphApiClient,
    webPage: content,
    /** @todo: expose this via an input for the action */
    // relevantEntitiesPrompt: prompt,
    validationActorId: userAuthentication.actorId,
    /** @todo: expose this via an input for the action */
    model: "gpt-4-1106-preview",
    entityTypes,
    inferenceState: webPageInferenceState,
  });

  if (status.code !== StatusCode.Ok) {
    return {
      code: status.code,
      contents: [],
      message: status.message,
    };
  }

  const proposedEntities = Object.values(
    status.contents[0]!.proposedEntityCreationsByType,
  ).flat();

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
            payload: {
              kind: "ProposedEntity",
              value: proposedEntities,
            },
          },
        ],
      },
    ],
  };
};
