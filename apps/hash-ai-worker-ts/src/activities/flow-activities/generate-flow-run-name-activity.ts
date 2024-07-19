import {
  automaticBrowserInferenceFlowDefinition,
  manualBrowserInferenceFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import type {
  AutomaticInferenceTriggerInputName,
  ManualInferenceTriggerInputName,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type { goalFlowDefinitionIds,GoalFlowTriggerInput  } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type {
  FlowDefinition,
  FlowTrigger,
  PayloadKind,
  PayloadKindValues,
} from "@local/hash-isomorphic-utils/flows/types";

import { getFlowContext } from "../shared/get-flow-context.js";
import type { getLlmResponse,UsageTrackingParams  } from "../shared/get-llm-response.js";
import { getTextContentFromLlmMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";

interface PersistFlowActivityParams {
  flowDefinition: FlowDefinition;
  flowTrigger: FlowTrigger;
}

const systemPrompt = `
You are a workflow naming agent. A workflow is an automated process that produces a result of interest.
Multiple workflows of the same kind are run with different inputs, and the user requires a unique name for each run, to distinguish it from other runs of the same kind.

The user provides you with a description of the goal of the workflow, or a description of the template and a list of its inputs, and you generate a short name for the run. Provide only the name – don't include any other text.

The name should be descriptive enough to distinguish it from other runs from the same template, and must always be a single human-readable sentence, with proper grammar and spacing between words.
Don't include any quotation marks or special characters around the name.
Don't include the word 'workflow' in the name – the user already knows it's a workflow.
`;

const getModelSuggestedFlowRunName = async (
  context: string,
  usageTrackingParams: UsageTrackingParams,
) => {
  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `User:${context}\nWorkflow name:`,
            },
          ],
        },
      ],
      model: "claude-3-haiku-20240307",
    },
    usageTrackingParams,
  );

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to generate flow run name - ${llmResponse.status}:${
        "message" in llmResponse ? llmResponse.message : "unknown"
      }`,
    );
  }

  const text = getTextContentFromLlmMessage({ message: llmResponse.message });

  if (!text) {
    throw new Error(
      `Failed to generate flow run name: no text content found in LLM message`,
    );
  }

  return text;
};

const outputKindsToIgnore: PayloadKind[] = ["GoogleSheet", "GoogleAccountId"];

export const generateFlowRunName = async (
  params: PersistFlowActivityParams,
) => {
  const { flowDefinition, flowTrigger } = params;

  if (
    [
      automaticBrowserInferenceFlowDefinition.flowDefinitionId,
      manualBrowserInferenceFlowDefinition.flowDefinitionId,
    ].includes(flowDefinition.flowDefinitionId)
  ) {
    const webPage = flowTrigger.outputs?.find(
      ({ outputName }) =>
        outputName ===
        ("visitedWebPage" satisfies AutomaticInferenceTriggerInputName &
          ManualInferenceTriggerInputName),
    )?.payload.value as PayloadKindValues["WebPage"] | undefined;

    if (!webPage) {
      throw new Error(`Web page not found in browser flow trigger outputs`);
    }

    return `${
      flowDefinition.flowDefinitionId ===
      automaticBrowserInferenceFlowDefinition.flowDefinitionId
        ? "Auto-analyze"
        : "Analyze"
    } webpage: ${webPage.url}`;
  }

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const usageTrackingParams: UsageTrackingParams = {
    customMetadata: { taskName: "name-flow", stepId },
    userAccountId: userAuthentication.actorId,
    graphApiClient,
    incurredInEntities: [{ entityId: flowEntityId }],
    webId,
  };

  if (goalFlowDefinitionIds.includes(flowDefinition.flowDefinitionId)) {
    const researchBrief = flowTrigger.outputs?.find(
      ({ outputName }) =>
        outputName === ("Research guidance" satisfies GoalFlowTriggerInput),
    )?.payload.value as PayloadKindValues["Text"] | undefined;

    if (!researchBrief) {
      throw new Error(`Research brief not found in goal flow trigger outputs`);
    }

    return getModelSuggestedFlowRunName(
      `The research brief for the workflow: ${researchBrief}`,
      usageTrackingParams,
    );
  }

  const inputsOfInterest = flowTrigger.outputs?.filter(
    (output) =>
      !["draft", "create as draft"].includes(output.outputName.toLowerCase()) &&
      !outputKindsToIgnore.includes(output.payload.kind),
  );

  return getModelSuggestedFlowRunName(
    `The workflow template is named ${
      flowDefinition.name
    } with a description of ${flowDefinition.description}.
    The inputs to the workflow run to be named: ${inputsOfInterest
      ?.map((input) => JSON.stringify(input))
      .join("\n")}`,
    usageTrackingParams,
  );
};
