import type { Subtype } from "@local/advanced-types/subtype";
import type { FlowDataSources } from "@local/hash-isomorphic-utils/flows/types";
import dedent from "dedent";

import type { LlmToolDefinition } from "../../shared/get-llm-response/types";
import type { CoordinatingAgentState } from "./coordinating-agent";

export const coordinatorToolNames = [
  "requestHumanInput",
  "webSearch",
  "inferFactsFromResources",
  "startFactGatheringSubTasks",
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
    startFactGatheringSubTasks: {
      name: "startFactGatheringSubTasks",
      description: dedent(`
      Start fact gathering sub-tasks to gather facts about entities required to complete the research task.
      Make use of this tool if the research task needs to be be broken down into smaller, non-overlapping sub-tasks.
      For example: "Find the technical specifications of the product with name X, including specification x, y and z".
      
      Subtasks must be independent and not overlap in any way with the information they gather.
      Subtasks run independently, and cannot share information between them.
      When gathering facts about a specific set of entities in multiple subtasks,
        you must name and specify which entities to focus on for each subtask.
      Do not leave it up to the subtasks to decide which entities to focus on,
        as this could result in looking up information about different entities in each subtask.
    `),
      inputSchema: {
        type: "object",
        properties: {
          subTasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                relevantEntityIds: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: dedent(`
                  The entity IDs of the proposed entities which the sub-task is relevant to.
                  
                  ${params.state?.entitySummaries.length ? `The possible values are: ${params.state.entitySummaries.map(({ localId }) => localId).join(", ")}` : ""}
                `),
                },
                entityTypeIds: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: dedent(`
                    The entity type IDs of the kind of entities the sub-task must gather facts about.
                    You must specify at least one.
                `),
                },
                linkEntityTypeIds: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: dedent(`
                    The link entity type IDs of the kind of link entities the sub-task must gather facts about.
                `),
                },
                goal: {
                  type: "string",
                  description: dedent(`
                  The goal of the sub-task, a detailed description of what is required to be achieved.
                  For example "Find the technical specifications of the product with name X".
                `),
                },
                explanation: {
                  type: "string",
                  description: dedent(`
                  An explanation of why the sub-task will advance the research task, and how it will be used.
                  You must also specify how the results of the sub-task will be used to populate specified
                    properties and outgoing links on the provided entity types.
                `),
                },
              },
              required: ["goal", "explanation", "entityTypeIds"],
            },
          },
        },
        required: ["subTasks"],
      },
    },
    webSearch: {
      name: "webSearch",
      description:
        "Perform a web search via a web search engine, returning a list of URLs. For best results, the query should be specific and concise.",
      inputSchema: {
        type: "object",
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
    inferFactsFromResources: {
      name: "inferFactsFromResources",
      description: dedent(`
      Infer facts from the content of resources.
      This tool should be used to gather facts about entities of specific types.
      The URLs for resources selected must have been provided in the user messages to you,
      or as the result of a previous action (e.g. a web search, or in suggestions for next steps). Don't guess URLs!
    `),
      inputSchema: {
        type: "object",
        properties: {
          explanation: explanationDefinition,
          resources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "The URL of the resource",
                },
                prompt: {
                  type: "string",
                  description: dedent(`
                A prompt instructing the inference agent which entities it should gather facts about from the resource.
                Do not specify any information of the structure of the entities, as this is predefined by
                  the entity type.
    
                You must be specific about which and how many entities you need to gather facts about to satisfy the research task.`),
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
                    "An explanation of why inferring facts from the resource is relevant to the research task.",
                },
                entityTypeIds: {
                  type: "array",
                  items: {
                    type: "string",
                    description: dedent(`
                      The entityTypeIds the kind of entities to infer facts about.
                      You must specify at least one.
                    `),
                  },
                },
                linkEntityTypeIds: {
                  type: "array",
                  items: {
                    type: "string",
                    description:
                      "The linkEntityTypeIds of the kind of link entities to infer facts about on the web page",
                  },
                },
                relevantEntityIds: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: dedent(`
                  The entityIds of already proposed entities which you are seeking further detail on, if any.
                `),
                },
              },
              required: [
                "url",
                "prompt",
                "entityTypeIds",
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
    `),
      inputSchema: {
        type: "object",
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
    inferFactsFromResources: {
      explanation: string;
      resources: {
        url: string;
        prompt: string;
        entityTypeIds: string[];
        linkEntityTypeIds?: string[];
        relevantEntityIds?: string[];
        reason: string;
        descriptionOfExpectedContent: string;
        exampleOfExpectedContent: string;
      }[];
    };
    startFactGatheringSubTasks: {
      subTasks: {
        goal: string;
        explanation: string;
        relevantEntityIds?: string[];
        entityTypeIds: string[];
        linkEntityTypeIds?: string[];
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
