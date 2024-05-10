import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type { Entity } from "@local/hash-subgraph";
import { Context } from "@temporalio/activity";
import dedent from "dedent";

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import { getFlowContext } from "../../shared/get-flow-context";
import { getLlmResponse } from "../../shared/get-llm-response";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message";
import { getToolCallsFromLlmAssistantMessage } from "../../shared/get-llm-response/llm-message";
import type { ParsedLlmToolCall } from "../../shared/get-llm-response/types";
import { graphApiClient } from "../../shared/graph-api-client";
import { mapActionInputEntitiesToEntities } from "../../shared/map-action-input-entities-to-entities";
import type { PermittedOpenAiModel } from "../../shared/openai-client";
import { requestExternalInput } from "../../shared/request-external-input";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./coordinator-tools";
import { coordinatorToolDefinitions } from "./coordinator-tools";
import type { AccessedRemoteFile } from "./infer-entities-from-web-page-worker-agent/types";
import type { CompletedToolCall } from "./types";
import { mapPreviousCallsToLlmMessages } from "./util";

const model: PermittedOpenAiModel = "gpt-4-0125-preview";

export type CoordinatingAgentInput = {
  prompt: string;
  entityTypes: DereferencedEntityType<string>[];
  linkEntityTypes?: DereferencedEntityType<string>[];
  existingEntities?: Entity[];
};

const generateSystemPromptPrefix = (params: {
  input: CoordinatingAgentInput;
}) => {
  const { linkEntityTypes, existingEntities } = params.input;

  return dedent(`
    You are a coordinating agent for a research task.

    The user will provide you with:
      - Prompt: the text prompt you need to satisfy to complete the research task
      - Entity Types: the types of entities you can propose to satisfy the research prompt
      ${
        linkEntityTypes
          ? dedent(`
      - Link Types: the types of links you can propose between entities
      `)
          : ""
      }
      ${
        existingEntities
          ? dedent(`
      - Existing Entities: a list of existing entities, that may contain relevant information
        and you may want to link to from the proposed entities.
      `)
          : ""
      }

    You must completely satisfy the research prompt, without any missing information.
  `);
};

const generateInitialUserMessage = (params: {
  input: CoordinatingAgentInput;
}): LlmUserMessage => {
  const { prompt, entityTypes, linkEntityTypes, existingEntities } =
    params.input;
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
        Prompt: ${prompt}
        Entity Types: ${JSON.stringify(entityTypes)}
        ${linkEntityTypes ? `Link Types: ${JSON.stringify(linkEntityTypes)}` : ""}
        ${existingEntities ? `Existing Entities: ${JSON.stringify(existingEntities)}` : ""}
      `),
      },
    ],
  };
};

export type CoordinatingAgentState = {
  plan: string;
  proposedEntities: ProposedEntity[];
  submittedEntityIds: string[];
  previousCalls: {
    completedToolCalls: CompletedToolCall<CoordinatorToolName>[];
  }[];
  hasConductedCheckStep: boolean;
  filesUsedToProposeEntities: AccessedRemoteFile[];
};

const getNextToolCalls = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
}): Promise<{
  toolCalls: ParsedLlmToolCall<CoordinatorToolName>[];
}> => {
  const { input, state } = params;

  const submittedProposedEntities = state.proposedEntities.filter(
    (proposedEntity) =>
      !("sourceEntityId" in proposedEntity) &&
      state.submittedEntityIds.includes(proposedEntity.localEntityId),
  );

  const submittedProposedLinks = state.proposedEntities.filter(
    (proposedEntity) =>
      "sourceEntityId" in proposedEntity &&
      state.submittedEntityIds.includes(proposedEntity.localEntityId),
  );

  const systemPrompt = dedent(`
      ${generateSystemPromptPrefix({ input })}
      
      Make as many tool calls as are required to progress towards completing the task.

      ${
        submittedProposedEntities.length > 0
          ? dedent(`
            You have previously submitted the following proposed entities:
            ${JSON.stringify(submittedProposedEntities, null, 2)}
          `)
          : "You have not previously submitted any proposed entities."
      }

      ${
        submittedProposedLinks.length > 0
          ? dedent(`
            You have previously submitted the following proposed links:
            ${JSON.stringify(submittedProposedLinks, null, 2)}
          `)
          : "You have not previously submitted any proposed links."
      }

      ${submittedProposedEntities.length > 0 || submittedProposedLinks.length > 0 ? 'If the submitted entities and links satisfy the research prompt, call the "complete" tool.' : ""}

      You have previously proposed the following plan:
      ${state.plan}
      If you want to deviate from this plan, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.
    `);

  const messages: LlmMessage[] = [
    generateInitialUserMessage({ input }),
    ...mapPreviousCallsToLlmMessages({ previousCalls: state.previousCalls }),
  ];

  const tools = Object.values(coordinatorToolDefinitions);

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages,
      model,
      tools,
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to get LLM response: ${JSON.stringify(llmResponse)}`,
    );
  }

  const { message, usage: _usage } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  /** @todo: capture usage */

  return { toolCalls };
};

const createInitialPlan = async (params: {
  input: CoordinatingAgentInput;
  questionsAndAnswers?: string;
}): Promise<{ plan: string }> => {
  const { input, questionsAndAnswers } = params;

  const systemPrompt = dedent(`
    ${generateSystemPromptPrefix({ input })}
    
    ${questionsAndAnswers ? `You previously asked the user clarifying questions on the research brief, and received the following answers:\n${questionsAndAnswers}` : ""}

    You must ${questionsAndAnswers ? "now" : "first"} do one of: 
    1. Ask the user ${questionsAndAnswers ? "further" : ""} questions to help clarify the research brief. You should ask questions if:
      - The scope of the research is unclear (e.g. how much information is desired in response)
      - The scope of the research task is very broad (e.g. the prompt is vague)
      - The research brief or terms within it are ambiguous
      - You can think of any other questions that will help you deliver a better response to the user
    If in doubt, ask!
    
    2. Provide a plan of how you will use the tools to progress towards completing the task, which should be a list of steps in plain English.
    
    Please now either ask the user your questions, or produce the initial plan if there are no ${questionsAndAnswers ? "more " : ""}useful questions to ask.
  `);

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      // tool_choice: "required",
      messages: [generateInitialUserMessage({ input })],
      model,
      tools: Object.values(coordinatorToolDefinitions).filter(
        ({ name }) => name === "updatePlan" || name === "requestHumanInput",
      ),
      seed: 1,
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to get LLM response: ${JSON.stringify(llmResponse)}`,
    );
  }

  const { usage: _usage, message } = llmResponse;

  /** @todo: capture usage */

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const firstToolCall = toolCalls[0];

  if (!firstToolCall) {
    throw new Error(
      `Expected tool calls in message: ${JSON.stringify(message, null, 2)}`,
    );
  }

  if (firstToolCall.name === "updatePlan") {
    const { plan } =
      firstToolCall.input as CoordinatorToolCallArguments["updatePlan"];

    return { plan };
  }

  const { questions } =
    firstToolCall.input as CoordinatorToolCallArguments["requestHumanInput"];

  const {
    data: { answers },
  } = await requestExternalInput({
    requestId: generateUuid(),
    stepId: Context.current().info.activityId,
    type: "human-input",
    data: {
      questions,
    },
  });

  const responseString = answers
    .map((answer, index) => `\nQuestion ${index + 1}:\n${answer}`)
    .join("\n");

  return createInitialPlan({
    input,
    questionsAndAnswers: (questionsAndAnswers ?? "") + responseString,
  });
};

const parseCoordinatorInputs = async (params: {
  stepInputs: StepInput[];
}): Promise<CoordinatingAgentInput> => {
  const { stepInputs } = params;

  const {
    prompt,
    entityTypeIds,
    existingEntities: inputExistingEntities,
  } = getSimplifiedActionInputs({
    inputs: stepInputs,
    actionType: "researchEntities",
  });

  const { userAuthentication } = await getFlowContext();

  /**
   * @todo: simplify the properties in the existing entities
   */
  const existingEntities = inputExistingEntities
    ? mapActionInputEntitiesToEntities({ inputEntities: inputExistingEntities })
    : undefined;

  const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
    graphApiClient,
    entityTypeIds: [
      ...entityTypeIds!,
      ...(existingEntities?.map(({ metadata }) => metadata.entityTypeId) ?? []),
    ].filter((entityTypeId, index, all) => all.indexOf(entityTypeId) === index),
    actorId: userAuthentication.actorId,
    simplifyPropertyKeys: true,
  });

  const entityTypes = Object.values(dereferencedEntityTypes)
    .filter(
      ({ isLink, schema }) => entityTypeIds!.includes(schema.$id) && !isLink,
    )
    .map(({ schema }) => schema);

  const linkEntityTypes = Object.values(dereferencedEntityTypes)
    .filter(
      ({ isLink, schema }) => entityTypeIds!.includes(schema.$id) && isLink,
    )
    .map(({ schema }) => schema);

  return {
    prompt,
    entityTypes,
    linkEntityTypes: linkEntityTypes.length > 0 ? linkEntityTypes : undefined,
    existingEntities,
  };
};

export const coordinatingAgent = {
  createInitialPlan,
  getNextToolCalls,
  parseCoordinatorInputs,
};
