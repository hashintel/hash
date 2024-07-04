import type { Subtype } from "@local/advanced-types/subtype";
import dedent from "dedent";

import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import type { LlmUserMessage } from "../../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import type {
  LlmParams,
  LlmToolDefinition,
} from "../../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import type { LocalEntitySummary } from "../../shared/infer-facts-from-text/get-entity-summaries-from-text.js";
import type { Fact } from "../../shared/infer-facts-from-text/types.js";
import type { Link } from "./extract-links-from-content.js";

const defaultModel: LlmParams["model"] = "claude-3-5-sonnet-20240620";

const getLinkFollowerNextToolCallsSystemPrompt = dedent(`
  You are a link follower agent.

  <UserMessageDefinition>
  The user will provide you with:
    - Task: a research task you have been instructed to fulfill,
        based on the contents of a resource (e.g. a webpage)
    - Previously Visited Links: links to resources which have been
        previously visited to extract facts
    - Entities: a list of entities for which facts have been gathered, including:
        - name: the name of the entity
        - summary: a summary of the entity
        - entityType: the type of the entity
        - facts: the facts that have been gathered about the entity
    - Possible Next Links: a list of the possible next links which
        may be explored next to gather more facts and fulfill the task
  </UserMessageDefinition>

  <TaskDescription>
  Using the provided tools, you must make a decision on what to do next to fulfill the task.

  You can only make a single tool call, which must be one of the following:
    - exploreLinks: call this tool to explore additional links to gather more facts that may fulfill the task
    - complete: complete the research task if all the gathered facts fulfill the task
    - terminate: terminate the research task if it cannot be progressed further
  </TaskDescription>
`);

type GetLinkFollowerNextToolCallsParams = {
  task: string;
  entitySummaries: LocalEntitySummary[];
  factsGathered: Fact[];
  previouslyVisitedLinks: { url: string }[];
  possibleNextLinks: Link[];
};

const simplifyFactForLlmConsumption = (fact: Fact) => {
  return `${fact.text} ${fact.prepositionalPhrases.join(", ")}`;
};

const generateUserMessage = (
  params: GetLinkFollowerNextToolCallsParams,
): LlmUserMessage => {
  const {
    task,
    entitySummaries,
    factsGathered,
    previouslyVisitedLinks,
    possibleNextLinks,
  } = params;

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
Task: ${task}
Previously Visited Links: ${JSON.stringify(previouslyVisitedLinks)}
Entities: ${JSON.stringify(
          entitySummaries.map(({ localId, name, summary, entityTypeId }) => {
            const factsAboutEntity = factsGathered.filter(
              (fact) => fact.subjectEntityLocalId === localId,
            );

            return {
              name,
              summary,
              entityType: entityTypeId,
              facts: JSON.stringify(
                factsAboutEntity.map(simplifyFactForLlmConsumption),
              ),
            };
          }),
        )}
Possible Next Links: ${JSON.stringify(possibleNextLinks)}
    `),
      },
    ],
  };
};

const toolNames = ["exploreLinks", "complete", "terminate"] as const;

type ToolName = (typeof toolNames)[number];

const suggestionForNextStepsDefinition = {
  type: "string",
  description: dedent(`
    A suggestion for how to find any relevant facts that could be used to provide values for additional properties.
    This should be a detailed explanation of how you would go about finding the missing facts from online resources.
    If the you've encountered URLs for web pages which may be relevant, you must include them in the suggestion.
  `),
};

const tools: LlmToolDefinition<ToolName>[] = [
  {
    name: "exploreLinks",
    description: dedent(`
      Explore the links specified to gather more facts and fulfill the task.
      The links must be one of the possible next links provided by the user.
    `),
    inputSchema: {
      type: "object",
      properties: {
        links: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL of the link to explore",
              },
              reason: {
                type: "string",
                description: "The reason for exploring this link",
              },
              descriptionOfExpectedContent: {
                type: "string",
                description: dedent(`
                  A description of the content you expect to find at the link.
                `),
              },
              exampleOfExpectedContent: {
                type: "string",
                description: dedent(`
                  An example of the content you expect to find at the link.
                `),
              },
            },
            required: [
              "url",
              "reason",
              "descriptionOfExpectedContent",
              "exampleOfExpectedContent",
            ],
          },
        },
      },
      required: ["links"],
    },
  },
  {
    name: "complete",
    description: "Complete the research task",
    inputSchema: {
      type: "object",
      properties: {
        suggestionForNextSteps: suggestionForNextStepsDefinition,
        explanation: {
          type: "string",
          description:
            "The reason the task is complete based on the facts gathered",
        },
      },
      required: ["explanation", "suggestionForNextSteps"],
    },
  },
  {
    name: "terminate",
    description: dedent(`
      Terminate the research task, because it cannot be progressed with the provided tools.

      Do not under any circumstances terminate the task if you were able to find some, but
        not all of the facts requested by the user.
    `),
    inputSchema: {
      type: "object",
      properties: {
        suggestionForNextSteps: suggestionForNextStepsDefinition,
        explanation: {
          type: "string",
          description:
            "The reason the task cannot be progressed with the provided tools",
        },
      },
      required: ["explanation", "suggestionForNextSteps"],
    },
  },
];

export type ToolCallInputs = Subtype<
  Record<ToolName, unknown>,
  {
    exploreLinks: {
      links: {
        url: string;
        reason: string;
        descriptionOfExpectedContent: string;
        exampleOfExpectedContent: string;
      }[];
    };
    complete: {
      explanation: string;
      suggestionForNextSteps: string;
    };
    terminate: {
      explanation: string;
      suggestionForNextSteps: string;
    };
  }
>;

export const getLinkFollowerNextToolCalls = async (
  params: {
    testingParams?: {
      model?: LlmParams["model"];
      systemPrompt?: string;
    };
  } & GetLinkFollowerNextToolCallsParams,
): Promise<{
  status: "ok";
  nextToolCall:
    | {
        name: "exploreLinks";
        input: ToolCallInputs["exploreLinks"];
      }
    | {
        name: "complete";
        input: ToolCallInputs["complete"];
      }
    | {
        name: "terminate";
        input: ToolCallInputs["terminate"];
      };
}> => {
  const { testingParams } = params;

  const userMessage = generateUserMessage(params);

  const { userAuthentication, flowEntityId, webId, stepId } =
    await getFlowContext();

  const response = await getLlmResponse(
    {
      systemPrompt:
        testingParams?.systemPrompt ?? getLinkFollowerNextToolCallsSystemPrompt,
      messages: [userMessage],
      model: testingParams?.model ?? defaultModel,
      toolChoice: "required",
      tools,
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      webId,
      incurredInEntities: [{ entityId: flowEntityId }],
      customMetadata: { taskName: "extract-links-from-content", stepId },
    },
  );

  if (response.status === "ok") {
    const toolCalls = getToolCallsFromLlmAssistantMessage({
      message: response.message,
    });

    if (toolCalls.length > 1) {
      /** @todo: handle the agent making multiple tool calls */

      throw new Error(
        `Expected a single tool call, but received ${toolCalls.length}`,
      );
    }

    const [nextToolCall] = toolCalls;

    if (!nextToolCall) {
      throw new Error("Failed to get tool call from LLM response");
    }

    if (nextToolCall.name === "complete") {
      return {
        status: "ok",
        nextToolCall: {
          name: "complete",
          input: nextToolCall.input as ToolCallInputs["complete"],
        },
      };
    } else if (nextToolCall.name === "terminate") {
      return {
        status: "ok",
        nextToolCall: {
          name: "terminate",
          input: nextToolCall.input as ToolCallInputs["terminate"],
        },
      };
    }

    return {
      status: "ok",
      nextToolCall: {
        name: "exploreLinks",
        input: nextToolCall.input as ToolCallInputs["exploreLinks"],
      },
    };
  }

  throw new Error(`Failed to get LLM response: ${response.status}`);
};
