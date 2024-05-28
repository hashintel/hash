import type { Entity } from "@local/hash-graph-types/entity";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import { Context } from "@temporalio/activity";
import dedent from "dedent";

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity";
import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types";
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
import { logProgress } from "../../shared/log-progress";
import { mapActionInputEntitiesToEntities } from "../../shared/map-action-input-entities-to-entities";
import type { PermittedOpenAiModel } from "../../shared/openai-client";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../shared/infer-facts-from-text/types";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./coordinator-tools";
import { generateToolCalls } from "./coordinator-tools";
import { generatePreviouslyInferredFactsSystemPromptMessage } from "./generate-previously-inferred-facts-system-prompt-message";
import { getAnswersFromHuman } from "./get-answers-from-human";
import type { AccessedRemoteFile } from "./infer-facts-from-web-page-worker-agent/types";
import type { ExistingEntitySummary } from "./summarize-existing-entities";
import { summarizeExistingEntities } from "./summarize-existing-entities";
import type { CompletedToolCall } from "./types";
import { mapPreviousCallsToLlmMessages } from "./util";

const model: PermittedOpenAiModel = "gpt-4-0125-preview";

export type CoordinatingAgentInput = {
  humanInputCanBeRequested: boolean;
  prompt: string;
  allDereferencedEntityTypesById: DereferencedEntityTypesByTypeId;
  entityTypes: DereferencedEntityType<string>[];
  linkEntityTypes?: DereferencedEntityType<string>[];
  existingEntities?: Entity[];
  existingEntitySummaries?: ExistingEntitySummary[];
};

const generateSystemPromptPrefix = (params: {
  input: CoordinatingAgentInput;
  questionsAndAnswers: CoordinatingAgentState["questionsAndAnswers"];
}) => {
  const { linkEntityTypes, existingEntities } = params.input;
  const { questionsAndAnswers } = params;

  return dedent(`
    You are a coordinating agent for a research task.
    You are tasked with proposing entities and links between entities to satisfy a research prompt.
    You will have tools provided to you to gather facts about entities, propose entities from the obtained facts, and submit the proposed entities to the user.
    Note that only proposed entities will be provided to the user, not the inferred facts.

    The user provides you with:
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

    You must carefully inspect the properties on the provided entity types and link types,
      and find all the relevant facts so that as many properties on the entity can be filled as possible.

    You may need to conduct multiple web searches, to find all the relevant facts to propose the entities.

    ${questionsAndAnswers ? `You previously asked the user clarifying questions on the research brief provided below, and received the following answers:\n${questionsAndAnswers}` : ""}
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
  previousCalls: {
    completedToolCalls: CompletedToolCall<CoordinatorToolName>[];
  }[];
  inferredFactsAboutEntities: LocalEntitySummary[];
  inferredFacts: Fact[];
  filesUsedToInferFacts: AccessedRemoteFile[];
  proposedEntities: ProposedEntity[];
  submittedEntityIds: string[];
  hasConductedCheckStep: boolean;
  filesUsedToProposeEntities: AccessedRemoteFile[];
  questionsAndAnswers: string | null;
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
      ${generateSystemPromptPrefix({ input, questionsAndAnswers: state.questionsAndAnswers })}

      Make as many tool calls as are required to progress towards completing the task.

      ${generatePreviouslyInferredFactsSystemPromptMessage(state)}

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

  const tools = Object.values(
    generateToolCalls({
      humanInputCanBeRequested: input.humanInputCanBeRequested,
    }),
  );

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

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  return { toolCalls };
};

const createInitialPlan = async (params: {
  input: CoordinatingAgentInput;
  questionsAndAnswers: CoordinatingAgentState["questionsAndAnswers"];
}): Promise<Pick<CoordinatingAgentState, "plan" | "questionsAndAnswers">> => {
  const { input } = params;

  const { questionsAndAnswers } = params;

  const systemPrompt = dedent(`
    ${generateSystemPromptPrefix({ input, questionsAndAnswers })}

    ${
      input.humanInputCanBeRequested
        ? dedent(`
          You must ${questionsAndAnswers ? "now" : "first"} do one of:
          1. Ask the user ${questionsAndAnswers ? "further" : ""} questions to help clarify the research brief. You should ask questions if:
            - The scope of the research is unclear (e.g. how much information is desired in response)
            - The scope of the research task is very broad (e.g. the prompt is vague)
            - The research brief or terms within it are ambiguous
            - You can think of any other questions that will help you deliver a better response to the user
          If in doubt, ask!

          2. Provide a plan of how you will use the tools to progress towards completing the task, which should be a list of steps in plain English.

          Please now either ask the user your questions, or produce the initial plan if there are no ${questionsAndAnswers ? "more " : ""}useful questions to ask.

          At this stage you may only use the 'requestHumanInput' and 'updatePlan' tools – definitions for the other tools are only provided to help you produce a plan.
    `)
        : dedent(`
        You must now provide a plan with the "updatePlan" tool of how you will use the tools to progress towards completing the task, which should be a list of steps in plain English.
        Do not make any other tool calls.
    `)
    }
  `);

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const tools = Object.values(
    generateToolCalls({
      humanInputCanBeRequested: input.humanInputCanBeRequested,
    }),
  );

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages: [generateInitialUserMessage({ input })],
      model,
      tools,
      seed: 1,
      toolChoice: "required",
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

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const firstToolCall = toolCalls[0];

  if (!firstToolCall) {
    throw new Error(
      `Expected tool calls in message: ${JSON.stringify(message, null, 2)}`,
    );
  }

  if (toolCalls.length > 1) {
    throw new Error(
      `Expected only one tool call in message: ${JSON.stringify(message, null, 2)}`,
    );
  }

  if (firstToolCall.name === "updatePlan") {
    const { plan } =
      firstToolCall.input as CoordinatorToolCallArguments["updatePlan"];

    logProgress([
      {
        recordedAt: new Date().toISOString(),
        stepId: Context.current().info.activityId,
        type: "CreatedPlan",
        plan,
      },
    ]);

    return { plan, questionsAndAnswers };
  }

  /** @todo: ensure the tool call is one of the expected ones */

  const { questions } =
    firstToolCall.input as CoordinatorToolCallArguments["requestHumanInput"];

  const responseString = await getAnswersFromHuman(questions);

  return createInitialPlan({
    input,
    questionsAndAnswers: (questionsAndAnswers ?? "") + responseString,
  });
};

const parseCoordinatorInputs = async (params: {
  stepInputs: StepInput[];
  testingParams?: {
    humanInputCanBeRequested?: boolean;
  };
}): Promise<CoordinatingAgentInput> => {
  const { stepInputs, testingParams } = params;

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

  let existingEntitySummaries: ExistingEntitySummary[] | undefined = undefined;

  if (existingEntities && existingEntities.length > 0) {
    existingEntitySummaries = (
      await summarizeExistingEntities({
        existingEntities,
      })
    ).existingEntitySummaries;
  }

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
    humanInputCanBeRequested: testingParams?.humanInputCanBeRequested ?? false,
    prompt,
    entityTypes,
    linkEntityTypes: linkEntityTypes.length > 0 ? linkEntityTypes : undefined,
    allDereferencedEntityTypesById: dereferencedEntityTypes,
    existingEntities,
    existingEntitySummaries,
  };
};

export const coordinatingAgent = {
  createInitialPlan,
  getNextToolCalls,
  parseCoordinatorInputs,
};
