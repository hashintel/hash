import type { Subtype } from "@local/advanced-types/subtype";
import type { FlowDataSources } from "@local/hash-isomorphic-utils/flows/types";
import dedent from "dedent";

import type { LlmToolDefinition } from "../../shared/get-llm-response/types.js";
import type { CoordinatingAgentState } from "./coordinating-agent.js";

export const coordinatorToolNames = [
  "requestHumanInput",
  "webSearch",
  "inferClaimsFromResources",
  "startClaimGatheringSubTasks",
  "complete",
  "terminate",
  "updatePlan",
] as const;

export type CoordinatorToolName = (typeof coordinatorToolNames)[number];

const explanationDefinition = {
  type: "string",
  description: dedent(`
    An explanation of why this tool call is required to satisfy the task,
    and how it aligns with the current plan. If the plan needs to be modified,
    make a call to the "updatePlan" tool.
  `),
} as const;

export const generateToolDefinitions = <
  T extends CoordinatorToolName[],
>(params: {
  dataSources: FlowDataSources;
  omitTools?: T;
  state?: CoordinatingAgentState;
}): Record<
  Exclude<CoordinatorToolName, T[number]>,
  LlmToolDefinition<Exclude<CoordinatorToolName, T[number]>>
> => {
  const { internetAccess } = params.dataSources;

  const omitTools: CoordinatorToolName[] = params.omitTools ?? [];
  if (!internetAccess.enabled) {
    omitTools.push("webSearch");
  }

  const allToolDefinitions: Record<
    CoordinatorToolName,
    LlmToolDefinition<CoordinatorToolName>
  > = {
    requestHumanInput: {
      name: "requestHumanInput",
      description:
        "Ask the user questions to gather information required to complete the research task, which include clarifying the research brief, or asking for advice on how to proceed if difficulties are encountered.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            type: "string",
            description:
              "An explanation of why human input is required to advance the research task, and how it will be used",
          },
          questions: {
            type: "array",
            items: {
              type: "string",
              description:
                "A question to help clarify or complete the research task",
            },
            description: "An array of questions to ask the user",
          },
        },
        required: ["explanation", "questions"],
      },
    },
    startClaimGatheringSubTasks: {
      name: "startClaimGatheringSubTasks",
      description: dedent(`
      Instruct a colleague to help you with a specific part of the research task.
      This is useful when the research task is complex and requires multiple people to work on different parts of it.
      
      Make sure that you take account of any information the user has provided you when instructing your colleague,
      including the original research brief and any subsequent clarifications. Pass this information on to your colleague
      as part of the instructions where it would be helpful.
      
      Where you are seeking additional information on specific entities, make sure to include their ids as relevantEntityIds     
    `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          subTasks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                relevantEntityIds: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: dedent(`
                  The entityId of the proposed entities which the sub-task is relevant to.
                  
                  ${
                    params.state?.entitySummaries.length
                      ? `The possible values are: ${params.state.entitySummaries
                          .map(({ localId }) => localId)
                          .join(", ")}`
                      : ""
                  }
                `),
                },
                goal: {
                  type: "string",
                  description: dedent(`
                  The goal of the sub-task – detailed instructions to your colleague about what you are seeking.
                  It should explain:
                  1. What the goal of the sub-task is and how it fits into the wider research task
                  2. If you are seeking more information on specific entities:
                    a. the names of the entities (their ids should be provided under relevantEntityIds)
                    b. what specific information you are seeking about them
                  
                  For example 
                  "Find the technical specifications of product X".
                  "Find the LinkedIn URL for person X"
                  "Find the release date, director and box office takings for movie X"
                `),
                },
                explanation: {
                  type: "string",
                  description: dedent(`
                  An explanation of why the sub-task will advance the research task, and how it will be used.
                  This is for audit purposes only and will not be provided to your colleague.
                  Provide all information needed to complete the sub-task in the 'goal' and 'relevantEntityIds' fields.
                `),
                },
              },
              required: ["goal", "explanation"],
            },
          },
        },
        required: ["subTasks"],
      },
    },
    webSearch: {
      name: "webSearch",
      description:
        dedent(`Perform a web search via a web search engine, returning a list of URLs. 
        For best results, the query should be specific and concise.
        Bear in mind that all the information you require may not be available via a single web search 
        – if you have various attributes to gather about specific entities, it may be worth performing multiple searches
        for each entity, or for each entity's attribute, until you find suitable results.
        `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "The web search query",
          },
          explanation: {
            type: "string",
            description:
              "An explanation of why the web search will advance the research task, and how it will be used",
          },
        },
        required: ["query", "explanation"],
      },
    },
    inferClaimsFromResources: {
      name: "inferClaimsFromResources",
      description: dedent(`
      Explore resources in order to discover entities and 'claims' (possible facts) regarding them.
      
      
      
      The URLs for resources selected must have been provided in the user messages to you,
      or as the result of a previous action (e.g. a web search, or in suggestions for next steps). Don't guess URLs!
      
      If you want additional information about entities you already know about, or to find new entities to link to existing entities,
      be sure to specify the existing entities under 'relevantEntityIds'.
      
      You can explore multiple resources at once, but don't start multiple redundant explorations for the same information.
      You can always explore another URL if one doesn't return the information you require.
    `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: explanationDefinition,
          resources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                url: {
                  type: "string",
                  description: "The URL of the resource",
                },
                goal: {
                  type: "string",
                  description: dedent(`
                  The goal of exploring this specific resource.
                  
                  DO include:
                  1. What specifies entities or types of entities you are seeking information on
                  2. Any guidance from the user, whether in the original instructions or subsequent questions and answers, which is relevant to the task
                  3. If you are seeking specific properties of entities (e.g. "Find me Bob's email"`),
                },
                descriptionOfExpectedContent: {
                  type: "string",
                  description: dedent(`
                    A description of the content you expect to find at the resource.
                  `),
                },
                exampleOfExpectedContent: {
                  type: "string",
                  description: dedent(`
                    An example of the content you expect to find at the resource.
                  `),
                },
                reason: {
                  type: "string",
                  description:
                    "An explanation of why inferring claims from the resource is relevant to the research task. This is for audit purposes only",
                },
                relevantEntityIds: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: dedent(`
                  The entityIds of already proposed entities which you are seeking further detail on, if any.
                  If you expect new entities you are seeking to be linked to already-discovered entities, specify the already-discovered entities here.
                  If you are unsure if an entity is relevant, just include it – it's better to include too many than too few.
                `),
                },
              },
              required: [
                "url",
                "goal",
                "reason",
                "descriptionOfExpectedContent",
                "exampleOfExpectedContent",
              ],
            },
          },
        },
        required: ["resources", "explanation"],
      },
    },
    complete: {
      name: "complete",
      description: dedent(`
            Complete the research task by specifying the entityIds of the entities to highlight as the result of your research.
          `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            type: "string",
            description: dedent(`
              An explanation of why these entities were chosen to highlight as the result of the research task,
              e.g. if the task asked for the 'top X' entities, explain why these are the top X.
            `),
          },
          entityIds: {
            type: "array",
            items: {
              type: "string",
            },
            description: dedent(`
            An array of entityIds to highlight. 
            The user will receive all entities discovered, with the highlighted entityIds identified for special attention.
            You must have made an effort to find as many properties and outgoing links for each entity as possible,
            as long as they relate to the research task in question.
          `),
          },
        },
        required: ["entityIds", "explanation"],
      },
    },
    terminate: {
      name: "terminate",
      description:
        "Terminate the research task, because it cannot be completed with the provided tools.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: explanationDefinition,
        },
        required: ["explanation"],
      },
    },
    updatePlan: {
      name: "updatePlan",
      description: dedent(`
      Update the plan for the research task.
      You can call this alongside other tool calls to progress towards completing the task.
      
      IMPORTANT: the plan should take account of:
      1. The user's research goal
      2. The information gathered so far.
      
      Don't be afraid to deviate from an earlier plan if you've gathered sufficient information to 
      meet the user's research goal, and return the information to the user.
    `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            type: "string",
            description: dedent(`
            An explanation of why the plan needs to be updated, and
            how the updated plan aligns with the task.
          `),
          },
          plan: {
            type: "string",
            description: "The updated plan for the research task.",
          },
        },
        required: ["plan", "explanation"],
      },
    },
  };

  const filteredTools = Object.fromEntries(
    Object.entries(allToolDefinitions).filter(
      ([toolName]) => !omitTools.includes(toolName as T[number]),
    ),
  ) as Record<
    Exclude<CoordinatorToolName, T[number]>,
    LlmToolDefinition<Exclude<CoordinatorToolName, T[number]>>
  >;

  return filteredTools;
};

export type CoordinatorToolCallArguments = Subtype<
  Record<CoordinatorToolName, unknown>,
  {
    requestHumanInput: {
      explanation: string;
      questions: string[];
    };
    webSearch: {
      explanation: string;
      query: string;
    };
    inferClaimsFromResources: {
      explanation: string;
      resources: {
        url: string;
        goal: string;
        relevantEntityIds?: string[];
        reason: string;
        descriptionOfExpectedContent: string;
        exampleOfExpectedContent: string;
      }[];
    };
    startClaimGatheringSubTasks: {
      subTasks: {
        goal: string;
        explanation: string;
        relevantEntityIds?: string[];
      }[];
    };
    updatePlan: {
      explanation: string;
      plan: string;
    };
    complete: {
      entityIds: string[];
      explanation: string;
    };
    terminate: {
      explanation: string;
    };
  }
>;
