import {
  automaticBrowserInferenceFlow,
  manualBrowserInferenceFlow,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { isGoalFlowDefinitionId } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getTextContentFromLlmMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";

import type { UsageTrackingParams } from "../shared/get-llm-response.js";
import type { EntityUuid } from "@blockprotocol/type-system";
import type {
  AutomaticInferenceInputName,
  ManualInferenceInputName,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type { GoalFlowInputName } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
  FlowInputValues,
  PayloadKind,
  PayloadKindValues,
} from "@local/hash-isomorphic-utils/flows/types";

type GenerateFlowRunNameActivityParams = {
  flowDefinition: FlowDefinition<FlowActionDefinitionId>;
  flowDefinitionId: EntityUuid;
  flowInputs: FlowInputValues;
};

const systemPrompt = `
You are a workflow naming agent. A workflow is an automated process that produces a result of interest.
Multiple workflows of the same kind are run with different inputs, and the user requires a unique name for each run, to distinguish it from other runs of the same kind.

The user provides you with a description of the goal of the workflow, or a description of the template and a list of its inputs, and you generate a short name for the run. Provide only the name – don't include any other text. If there are no inputs provided, you can generate a name based on the template description alone.

The name should be descriptive enough to distinguish it from other runs from the same template, and must always be a single human-readable sentence, with proper grammar and spacing between words.

<Rules>
Don't include any quotation marks or special characters around the name.
Don't include the word 'workflow' in the name – the user already knows it's a workflow.
Don't include UUIDs or other identifiers that aren't natural language words. Omit them, or use a generic human-readable replacement (e.g. 'entity').
</Rules>
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
      model: "claude-haiku-4-5-20251001",
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

const inputKindsToIgnore: PayloadKind[] = [
  "GoogleSheet",
  "GoogleAccountId",
  "EntityId",
];

export const generateFlowRunName = async (
  params: GenerateFlowRunNameActivityParams,
) => {
  const { flowDefinition, flowDefinitionId, flowInputs } = params;

  if (
    [
      automaticBrowserInferenceFlow.flowDefinitionId,
      manualBrowserInferenceFlow.flowDefinitionId,
    ].includes(flowDefinitionId)
  ) {
    const webPage = flowInputs[
      "visitedWebPage" satisfies AutomaticInferenceInputName &
        ManualInferenceInputName
    ]?.value as PayloadKindValues["WebPage"] | undefined;

    if (!webPage) {
      throw new Error(`Web page not found in browser flow inputs`);
    }

    return `${
      flowDefinitionId === automaticBrowserInferenceFlow.flowDefinitionId
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

  if (isGoalFlowDefinitionId(flowDefinitionId)) {
    const researchBrief = flowInputs[
      "researchGuidance" satisfies GoalFlowInputName
    ]?.value as PayloadKindValues["Text"] | undefined;

    if (!researchBrief) {
      throw new Error(`Research brief not found in goal flow inputs`);
    }

    return getModelSuggestedFlowRunName(
      `The research brief for the workflow: ${researchBrief}`,
      usageTrackingParams,
    );
  }

  const inputsOfInterest = Object.entries(flowInputs).flatMap(
    ([inputName, payload]) =>
      inputName !== "draft" && !inputKindsToIgnore.includes(payload.kind)
        ? [{ inputName, payload }]
        : [],
  );

  let workflowDescriptionString = `The workflow template is named ${
    flowDefinition.name
  } with a description of ${flowDefinition.description}.`;

  if (inputsOfInterest.length) {
    workflowDescriptionString += ` The inputs to the workflow run to be named: ${inputsOfInterest
      .map((input) => JSON.stringify(input))
      .join("\n")}.`;
  } else {
    workflowDescriptionString += ` The workflow run to be named has no inputs.`;
  }

  return getModelSuggestedFlowRunName(
    workflowDescriptionString,
    usageTrackingParams,
  );
};
