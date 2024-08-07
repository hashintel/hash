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
import type { LocalEntitySummary } from "../../shared/infer-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../../shared/infer-claims-from-text/types.js";
import { simplifyClaimForLlmConsumption } from "../shared/simplify-for-llm-consumption.js";
import type { Link } from "./choose-relevant-links-from-content.js";

const defaultModel: LlmParams["model"] = "gpt-4o-2024-08-06";

const getLinkFollowerNextToolCallsSystemPrompt = dedent(`
  You are a link follower agent.

  <UserMessageDefinition>
  The user will provide you with:
    - Task: a research task you have been instructed to fulfill, based on the contents of a resource (e.g. a webpage)
    - Previously Visited Links: links to resources which have been previously visited to extract claims
    - Entities: a list of entities for which claims have been gathered, including:
        - name: the name of the entity
        - summary: a summary of the entity
        - entityType: the type of the entity
        - claims: the claims that have been gathered about the entity
    - Possible Next Links: a list of the possible next links which may be explored next to gather more claims and fulfill the task
  </UserMessageDefinition>

  <TaskDescription>
  Using the provided tools, you must make a decision on what to do next to fulfill the task.

  You can only make a single tool call, which must be one of the following:
    - complete: complete the research task if the gathered claims fulfill the task
    - exploreLinks: call this tool to explore additional links to gather more claims that may fulfill the task
    - terminate: terminate the research task if it cannot be progressed further
    
  If you already have enough claims to meet the research brief, call 'complete'. 
  Don't follow more links unless it is required to meet the goal of the research task.
  </TaskDescription>
  
  Balance any need to gather more claims with the need to complete the task in a timely manner.
  Consider the research task and the claims already gathered when making your decision.
`);

type GetLinkFollowerNextToolCallsParams = {
  task: string;
  entitySummaries: LocalEntitySummary[];
  claimsGathered: Claim[];
  previouslyVisitedLinks: { url: string }[];
  possibleNextLinks: Link[];
};

const generateUserMessage = (
  params: GetLinkFollowerNextToolCallsParams,
): LlmUserMessage => {
  const {
    task,
    entitySummaries,
    claimsGathered,
    previouslyVisitedLinks,
    possibleNextLinks,
  } = params;

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
<Task>${task}</Task>
<PreviouslyVisitedLinks>${previouslyVisitedLinks
          .map(({ url }) => url)
          .join("\n")}</PreviouslyVisitedLinks>
<Entities>
Here is the information about entities you have already gathered:
${JSON.stringify(
  entitySummaries.map(({ localId, name, summary, entityTypeId }) => {
    const claimsAboutEntity = claimsGathered.filter(
      (claim) => claim.subjectEntityLocalId === localId,
    );

    return {
      name,
      summary,
      entityType: entityTypeId,
      claims: JSON.stringify(
        claimsAboutEntity.map(simplifyClaimForLlmConsumption),
      ),
    };
  }),
  undefined,
  2,
)}</Entities>
<PossibleNextLinks>
${JSON.stringify(
  possibleNextLinks.filter(
    (link) => !previouslyVisitedLinks.some(({ url }) => url === link.url),
  ),
  undefined,
  2,
)}
</PossibleNextLinks>

Now decide what to do next. If you have gathered enough information about entities to satisfy the task, call 'complete'.
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
    A suggestion for how to find any relevant claims that could be used to provide values for additional properties.
    This should be a detailed explanation of how you would go about finding the missing claims from online resources.
    If the you've encountered URLs for web pages which may be relevant, you must include them in the suggestion.
  `),
};

const tools: LlmToolDefinition<ToolName>[] = [
  {
    name: "exploreLinks",
    description: dedent(`
      Explore the links specified to gather more claims and fulfill the task.
      The links must be one of the possible next links provided by the user.
    `),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        links: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
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
    description:
      "Complete the research task, if you have gathered enough claims to satisfy the research goal.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        suggestionForNextSteps: suggestionForNextStepsDefinition,
        explanation: {
          type: "string",
          description:
            "The reason the task is complete based on the claims gathered.",
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
        not all of the claims requested by the user.
    `),
    inputSchema: {
      type: "object",
      additionalProperties: false,
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

  const { dataSources, userAuthentication, flowEntityId, webId, stepId } =
    await getFlowContext();

  const availableTools = dataSources.internetAccess.enabled
    ? tools
    : tools.filter((tool) => tool.name !== "exploreLinks");

  const response = await getLlmResponse(
    {
      systemPrompt:
        testingParams?.systemPrompt ?? getLinkFollowerNextToolCallsSystemPrompt,
      messages: [userMessage],
      model: testingParams?.model ?? defaultModel,
      toolChoice: "required",
      tools: availableTools,
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      webId,
      incurredInEntities: [{ entityId: flowEntityId }],
      customMetadata: { taskName: "link-follower", stepId },
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

  return getLinkFollowerNextToolCalls(params);
};
