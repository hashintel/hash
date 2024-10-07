import dedent from "dedent";

import { logger } from "../../../shared/activity-logger.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { stringify } from "../../../shared/stringify.js";
import { getAnswersFromHuman } from "../get-answers-from-human.js";
import {
  type CoordinatorToolCallArguments,
  generateToolDefinitions,
} from "../shared/coordinator-tools.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "../shared/coordinators.js";
import { coordinatingAgentModel } from "../shared/coordinators.js";
import {
  generateInitialUserMessage,
  generateSystemPromptPrefix,
} from "./generate-messages.js";

const maximumRetries = 3;

export const createInitialPlan = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  questionsAndAnswers: CoordinatingAgentState["questionsAndAnswers"];
  providedFiles: CoordinatingAgentState["resourcesNotVisited"];
  retryContext?: { retryMessages: LlmMessage[]; retryCount: number };
}): Promise<Pick<CoordinatingAgentState, "plan" | "questionsAndAnswers">> => {
  const { input, state, questionsAndAnswers, providedFiles, retryContext } =
    params;

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
      state,
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
      model: coordinatingAgentModel,
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
      state,
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
      state,
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
