import type { Entity } from "@local/hash-graph-sdk/entity";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";
import dedent from "dedent";

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity.js";
import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types.js";
import { logger } from "../../shared/activity-logger.js";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { getLlmResponse } from "../../shared/get-llm-response.js";
import type {
  LlmMessage,
  LlmMessageTextContent,
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../shared/get-llm-response/llm-message.js";
import type {
  LlmParams,
  ParsedLlmToolCall,
} from "../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { mapActionInputEntitiesToEntities } from "../../shared/map-action-input-entities-to-entities.js";
import { stringify } from "../../shared/stringify.js";
import type { LocalEntitySummary } from "../shared/infer-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../shared/infer-claims-from-text/types.js";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./coordinator-tools.js";
import { generateToolDefinitions } from "./coordinator-tools.js";
import { getAnswersFromHuman } from "./get-answers-from-human.js";
import {
  simplifyEntityTypeForLlmConsumption,
  simplifyProposedEntityForLlmConsumption,
} from "./shared/simplify-for-llm-consumption.js";
import type { ExistingEntitySummary } from "./summarize-existing-entities.js";
import { summarizeExistingEntities } from "./summarize-existing-entities.js";
import type { CompletedCoordinatorToolCall, ResourceSummary } from "./types.js";
import { mapPreviousCallsToLlmMessages } from "./util.js";

const model: LlmParams["model"] = "gpt-4o-2024-08-06";

export type CoordinatingAgentInput = {
  humanInputCanBeRequested: boolean;
  prompt: string;
  reportSpecification?: string;
  allDereferencedEntityTypesById: DereferencedEntityTypesByTypeId;
  entityTypes: DereferencedEntityType<string>[];
  linkEntityTypes?: DereferencedEntityType<string>[];
  existingEntities?: Entity[];
  existingEntitySummaries?: ExistingEntitySummary[];
};

const generateSystemPromptPrefix = (params: {
  input: CoordinatingAgentInput;
}) => {
  const { linkEntityTypes, existingEntities, reportSpecification } =
    params.input;

  return dedent(`
    You are a coordinating agent for a research task.
    The user provides you with a research brief, and the types of entities that are relevant.
    Your job is to do research to gather claims about those types of entities, consistent with the research brief,
    as well as relevant entities that they link to – forming a graph.
    
    You will have tools provided to you to gather claims, which will be automatically converted into entities.

    The user provides you with:
      - Prompt: the text prompt you need to satisfy to complete the research task
      ${
        reportSpecification
          ? dedent(`
      - Report Specification: the specification for the report your research will be used to produce – keep these requirements in mind when conducting research
      `)
          : ""
      }
      - Entity Types: the types of entities of interest
      ${
        linkEntityTypes
          ? dedent(`
      - Link Types: the types of links which are possible between entities
      `)
          : ""
      }
      ${
        existingEntities
          ? dedent(`
      - Existing Entities: a list of existing entities, that may contain relevant information.
      `)
          : ""
      }

    You must completely satisfy the research prompt, without any missing information.

    You must carefully examine the properties on the provided entity types and link types, because you must provide values for
      as many properties as possible.

    This may well involve:
      - inferring claims from more than one data source
      - conducting multiple searches
      - starting sub-tasks to find additional relevant claims about specific entities

    If it would be useful to split up the task into sub-tasks to find detailed information on specific entities, do so. 
    Don't start sub-tasks in parallel which duplicate or overlap, or where one will depend on the result of another (do it in sequence).
    For simpler research tasks you might not need sub-tasks.

    The "complete" tool for completing the research task will only be available once entities have been discovered.
    When declaring the job complete, you specify which of the proposed entities should be included in the final return to the user.
  `);
};

const generateInitialUserMessage = (params: {
  input: CoordinatingAgentInput;
  questionsAndAnswers: CoordinatingAgentState["questionsAndAnswers"];
}): LlmMessageTextContent => {
  const {
    prompt,
    reportSpecification,
    entityTypes,
    linkEntityTypes,
    existingEntities,
  } = params.input;

  return {
    type: "text",
    text: dedent(`
<ResearchPrompt>${prompt}</ResearchPrompt>
${
  reportSpecification
    ? `<ReportSpecification>${reportSpecification}<ReportSpecification>`
    : ""
}
<EntityTypes>
${entityTypes
  .map((entityType) => simplifyEntityTypeForLlmConsumption({ entityType }))
  .join("\n")}
</EntityTypes>
${
  /**
   * @todo: simplify link type definitions, potentially by moving them to an "Outgoing Links" field
   * on the simplified entity type definition.
   *
   * @see https://linear.app/hash/issue/H-2826/simplify-property-values-for-llm-consumption
   */
  linkEntityTypes
    ? `<LinkTypes>${linkEntityTypes
        .map((linkType) =>
          simplifyEntityTypeForLlmConsumption({ entityType: linkType }),
        )
        .join("\n")}</LinkTypes>`
    : ""
}
${
  existingEntities
    ? `Existing Entities: ${JSON.stringify(existingEntities)}`
    : ""
}
      `),
  };
};

export type CoordinatingAgentState = {
  coordinatorIdentifiers: WorkerIdentifiers;
  plan: string;
  previousCalls: {
    completedToolCalls: CompletedCoordinatorToolCall<CoordinatorToolName>[];
  }[];
  entitySummaries: LocalEntitySummary[];
  inferredClaims: Claim[];
  proposedEntities: ProposedEntity[];
  subTasksCompleted: string[];
  suggestionsForNextStepsMade: string[];
  submittedEntityIds: string[];
  resourceUrlsVisited: string[];
  resourcesNotVisited: ResourceSummary[];
  webQueriesMade: string[];
  hasConductedCheckStep: boolean;
  questionsAndAnswers: string | null;
};

const generateProgressReport = (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
}): LlmMessageTextContent => {
  const { state, input } = params;

  const {
    subTasksCompleted,
    suggestionsForNextStepsMade,
    resourcesNotVisited,
    resourceUrlsVisited,
    webQueriesMade,
  } = state;

  const { allDereferencedEntityTypesById } = input;

  const proposedEntities = state.proposedEntities.filter(
    (proposedEntity) => !("sourceEntityId" in proposedEntity),
  );

  const proposedLinks = state.proposedEntities.filter(
    (proposedEntity) => "sourceEntityId" in proposedEntity,
  );

  let progressReport = state.plan
    ? dedent`You have previously proposed the following plan:
      ${state.plan}

      If you want to deviate from this plan or improve it, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.\n\n
      `
    : "";

  if (proposedEntities.length > 0 || proposedLinks.length > 0) {
    progressReport +=
      "Here's what we've discovered so far. If this is sufficient to satisfy the research brief, call 'complete' with the entityIds of the entities and links of interest:\n\n";
    if (proposedEntities.length > 0) {
      progressReport += dedent(`
      <DiscoveredEntities>
      ${proposedEntities
        .map((proposedEntity) =>
          simplifyProposedEntityForLlmConsumption({
            proposedEntity,
            entityType:
              allDereferencedEntityTypesById[proposedEntity.entityTypeId]!
                .schema,
          }),
        )
        .join("\n")}
      </DiscoveredEntities>
    `);
    }
    if (proposedLinks.length > 0) {
      progressReport += dedent(`
      <DiscoveredLinks>
      ${proposedLinks
        .map((proposedLink) =>
          simplifyProposedEntityForLlmConsumption({
            proposedEntity: proposedLink,
            entityType:
              allDereferencedEntityTypesById[proposedLink.entityTypeId]!.schema,
          }),
        )
        .join("\n")}
      </DiscoveredLinks>
    `);
    }

    progressReport += dedent`
    If further research is needed to fill more properties of any entities or links,
      consider defining them as sub-tasks via the "startClaimGatheringSubTasks" tool.

    Do not sequentially conduct additional actions for each of the entities,
      instead start multiple sub-tasks via the "startClaimGatheringSubTasks" tool to
      conduct additional research per entity in parallel.`;
  }
  if (
    resourceUrlsVisited.length > 0 ||
    resourcesNotVisited.length > 0 ||
    webQueriesMade.length > 0
  ) {
    if (resourceUrlsVisited.length > 0) {
      progressReport += dedent(`
        You have discovered the following resources via web searches but noy yet visited them. It may be worth inferring claims from the URL.
        <ResourcesNotVisited>
        ${resourcesNotVisited
          .map(
            (webPage) =>
              `
<Resource>
  <Url>${webPage.url}</Url>
  <Summary>${webPage.summary}</Summary>
  <FromWebSearch>"${webPage.fromSearchQuery}"</FromWebSearch>
</Resource>`,
          )
          .join("\n")}
        </ResourcesNotVisited>
      `);
    }
    if (resourcesNotVisited.length > 0) {
      progressReport += dedent(`
        You have not visited the following resources:
        <ResourcesNotVisited>
        ${resourcesNotVisited
          .map((webPage) => `Url: ${webPage.url}\nSummary:${webPage.summary}`)
          .join("\n\n")}
        </ResourcesNotVisited>
      `);
    }
    if (webQueriesMade.length > 0) {
      progressReport += dedent(`
        You have made the following web searches – there is no point in making these or very similar searches again:
        <WebSearchesMade>
        ${webQueriesMade.join("\n")}
        </WebSearchesMade>
      `);
    }
  }

  if (suggestionsForNextStepsMade.length > 0) {
    progressReport += dedent(`
      We have received the following suggestions for next steps (some may now be redundant or already have been acted upon):
      <SuggestionsForNextSteps>
      ${suggestionsForNextStepsMade.join("\n")}
      </SuggestionsForNextSteps>
    `);
  }

  if (subTasksCompleted.length > 0) {
    progressReport += dedent(`
      You have completed the following sub-tasks:
      <SubTasksCompleted>
      ${subTasksCompleted.join("\n")}
      </SubTasksCompleted>
    `);
  }

  progressReport += dedent(`
    Now decide what to do next. Pay close attention to any missing properties on entities, and consider doing work to populate them.
  `);

  return {
    type: "text",
    text: progressReport,
  };
};

const getNextToolCalls = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  forcedToolCall?: CoordinatorToolName;
}): Promise<{
  toolCalls: ParsedLlmToolCall<CoordinatorToolName>[];
}> => {
  const { input, state, forcedToolCall } = params;

  const systemPrompt = dedent(`
      ${generateSystemPromptPrefix({
        input,
      })}

      Make as many tool calls as are required to progress towards completing the task.
    `);

  const llmMessagesFromPreviousToolCalls = mapPreviousCallsToLlmMessages({
    previousCalls: state.previousCalls,
  });

  const lastUserMessage = llmMessagesFromPreviousToolCalls.slice(-1)[0];

  if (lastUserMessage && lastUserMessage.role !== "user") {
    throw new Error(
      `Expected last message to be a user message, but it was: ${stringify(
        lastUserMessage,
      )}`,
    );
  }

  const progressReport = generateProgressReport({ input, state });

  const messages: LlmMessage[] = [
    {
      role: "user",
      content: [
        generateInitialUserMessage({
          input,
          questionsAndAnswers: state.questionsAndAnswers,
        }),
        progressReport,
      ],
    } satisfies LlmUserMessage,
  ];

  const { dataSources, userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const tools = Object.values(
    generateToolDefinitions({
      dataSources,
      omitTools: [
        ...(input.humanInputCanBeRequested
          ? []
          : ["requestHumanInput" as const]),
        ...(state.proposedEntities.length > 0 ? [] : ["complete" as const]),
      ],
      state,
    }),
  );

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages,
      model,
      tools,
      toolChoice: forcedToolCall ?? "required",
    },
    {
      customMetadata: {
        stepId,
        taskName: "coordinator",
      },
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

const maximumRetries = 3;

const createInitialPlan = async (params: {
  input: CoordinatingAgentInput;
  questionsAndAnswers: CoordinatingAgentState["questionsAndAnswers"];
  providedFiles: CoordinatingAgentState["resourcesNotVisited"];
  retryContext?: { retryMessages: LlmMessage[]; retryCount: number };
}): Promise<Pick<CoordinatingAgentState, "plan" | "questionsAndAnswers">> => {
  const { input, questionsAndAnswers, providedFiles, retryContext } = params;

  const { dataSources, userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const systemPrompt = dedent(`
    ${generateSystemPromptPrefix({ input })}
    
    ${
      providedFiles.length
        ? dedent(`
      The user has provided you with the following resources which can be used to infer claims from:
      ${providedFiles
        .map(
          (file) =>
            `<Resource>Url: ${file.url}\nTitle: ${file.title}</Resource>`,
        )
        .join("\n\n")}`)
        : ""
    }
    
    ${
      dataSources.internetAccess.enabled
        ? "You can also conduct web searches and visit public web pages."
        : "Public internet access is disabled – you must rely on the provided resources."
    }

    ${
      input.humanInputCanBeRequested
        ? dedent(`
          You must ${questionsAndAnswers ? "now" : "first"} do one of:
          1. Ask the user ${
            questionsAndAnswers ? "further" : ""
          } questions to help clarify the research brief. You should ask questions if:
            - The scope of the research is unclear (e.g. how much information is desired in response)
            - The scope of the research task is very broad (e.g. the prompt is vague)
            - The research brief or terms within it are ambiguous
            - You can think of any other questions that will help you deliver a better response to the user
          If in doubt, ask!

          2. Provide a plan of how you will use the tools to progress towards completing the task, which should be a list of steps in plain English.
          
          ${
            questionsAndAnswers
              ? `<PreviouslyAnsweredQuestions>You previously asked the user clarifying questions on the research brief provided below, and received the following answers:\n${questionsAndAnswers}          
      </PreviouslyAnsweredQuestions>`
              : ""
          }

          Please now either ask the user your questions, or produce the initial plan if there are no ${
            questionsAndAnswers ? "more " : ""
          }useful questions to ask.
          
          You must now make either a "requestHumanInput" or a "updatePlan" tool call – definitions for the other tools are only provided to help you produce a plan.
    `)
        : dedent(`
        You must now provide a plan with the "updatePlan" tool of how you will use the tools to progress towards completing the task, which should be a list of steps in plain English.
        Do not make any other tool calls.
    `)
    }
  `);

  const tools = Object.values(
    generateToolDefinitions<["complete"]>({
      dataSources,
      omitTools: input.humanInputCanBeRequested
        ? ["complete"]
        : (["complete", "requestHumanInput"] as unknown as ["complete"]),
    }),
  );

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages: [
        {
          role: "user",
          content: [generateInitialUserMessage({ input, questionsAndAnswers })],
        } satisfies LlmUserMessage,
        ...(retryContext?.retryMessages ?? []),
      ],
      model,
      tools,
      toolChoice: input.humanInputCanBeRequested ? "required" : "updatePlan",
    },
    {
      customMetadata: {
        stepId,
        taskName: "coordinator",
      },
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

  const updatePlanToolCall = toolCalls.find(
    (toolCall) => toolCall.name === "updatePlan",
  );

  if (updatePlanToolCall) {
    const { plan } =
      updatePlanToolCall.input as CoordinatorToolCallArguments["updatePlan"];

    return { plan, questionsAndAnswers };
  }

  const retry = (retryParams: { retryMessage: LlmUserMessage }) => {
    const retryCount = retryContext?.retryCount ?? 1;

    if (retryCount >= maximumRetries) {
      throw new Error(
        `Exceeded maximum number of retries (${maximumRetries}) for creating initial plan`,
      );
    }

    logger.debug(
      `Retrying to create initial plan with retry message: ${stringify(
        retryParams.retryMessage,
      )}`,
    );

    return createInitialPlan({
      input,
      questionsAndAnswers,
      providedFiles,
      retryContext: {
        retryMessages: [message, retryParams.retryMessage],
        retryCount: retryCount + 1,
      },
    });
  };

  /** @todo: ensure the tool call is one of the expected ones */

  const requestHumanInputToolCall = toolCalls.find(
    (toolCall) => toolCall.name === "requestHumanInput",
  );

  if (input.humanInputCanBeRequested && requestHumanInputToolCall) {
    const { questions } =
      requestHumanInputToolCall.input as CoordinatorToolCallArguments["requestHumanInput"];

    const responseString = await getAnswersFromHuman(questions);

    return createInitialPlan({
      input,
      providedFiles,
      questionsAndAnswers: (questionsAndAnswers ?? "") + responseString,
    });
  }

  if (toolCalls.length === 0) {
    return retry({
      retryMessage: {
        role: "user",
        content: [
          {
            type: "text",
            text: `You didn't make any tool calls, you must call the ${
              input.humanInputCanBeRequested
                ? `"requestHumanInput" tool or the`
                : ""
            }"updatePlan" tool.`,
          },
        ],
      },
    });
  }

  return retry({
    retryMessage: {
      role: "user",
      content: toolCalls.map(({ name, id }) => ({
        type: "tool_result",
        tool_use_id: id,
        content: `You cannot call the "${name}" tool yet, you must call the ${
          input.humanInputCanBeRequested
            ? `"requestHumanInput" tool or the`
            : ""
        }"updatePlan" tool first.`,
        is_error: true,
      })),
    },
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
    reportSpecification,
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
    humanInputCanBeRequested: testingParams?.humanInputCanBeRequested ?? true,
    prompt,
    reportSpecification,
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
