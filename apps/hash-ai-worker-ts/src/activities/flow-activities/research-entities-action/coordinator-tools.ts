import type { Subtype } from "@local/advanced-types/subtype";
import dedent from "dedent";

import type { LlmToolDefinition } from "../../shared/get-llm-response/types";
import type { CoordinatingAgentState } from "./coordinating-agent";

export const coordinatorToolNames = [
  "requestHumanInput",
  "webSearch",
  "inferFactsFromWebPages",
  "proposeEntitiesFromFacts",
  "submitProposedEntities",
  "startFactGatheringSubTasks",
  "complete",
  "terminate",
  "updatePlan",
] as const;

export type CoordinatorToolName = (typeof coordinatorToolNames)[number];

export const isCoordinatorToolName = (
  value: string,
): value is CoordinatorToolName =>
  coordinatorToolNames.includes(value as CoordinatorToolName);

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
  omitTools?: T;
  state?: CoordinatingAgentState;
}): Record<
  Exclude<CoordinatorToolName, T[number]>,
  LlmToolDefinition<Exclude<CoordinatorToolName, T[number]>>
> => {
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
      Start fact gathering sub-tasks to gather facts required to complete the research task.
      Make use of this tool if the research task can be broken down into smaller sub-tasks.
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
                  The entity IDs of the entities which the sub-task is relevant to, for which existing
                    facts have already been inferred.
                  
                  ${params.state?.inferredFactsAboutEntities.length ? `The possible values are: ${params.state.inferredFactsAboutEntities.map(({ localId }) => localId).join(", ")}` : ""}
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
    inferFactsFromWebPages: {
      name: "inferFactsFromWebPages",
      description: dedent(`
      Infer facts from the content of web pages.
      This tool should be used to gather facts about entities of specific types, before the entities can be proposed.
    `),
      inputSchema: {
        type: "object",
        properties: {
          explanation: explanationDefinition,
          webPages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "The URL of the web page",
                },
                prompt: {
                  type: "string",
                  description: dedent(`
                A prompt instructing the inference agent which entities it should gather facts about from the webpage.
                Do not specify any information of the structure of the entities, as this is predefined by
                  the entity type.
    
                You must be specific about which and how many entities you need to gather facts about from
                  the webpage to satisfy the research task.
              `),
                },
                entityTypeIds: {
                  type: "array",
                  items: {
                    type: "string",
                    description: dedent(`
                      The entity type IDs of the kind of entities to infer facts about on the web page.
                      You must specify at least one.
                    `),
                  },
                },
                linkEntityTypeIds: {
                  type: "array",
                  items: {
                    type: "string",
                    description:
                      "The link entity type IDs of the kind of link entities to infer facts about on the web page",
                  },
                },
              },
              required: ["url", "prompt", "entityTypeIds"],
            },
          },
        },
        required: ["webPages", "explanation"],
      },
    },
    submitProposedEntities: {
      name: "submitProposedEntities",
      description:
        "Submit one or more proposed entities as the `result` of the research task.",
      inputSchema: {
        type: "object",
        properties: {
          explanation: explanationDefinition,
          entityIds: {
            type: "array",
            items: {
              type: "string",
            },
            description: dedent(`
            An array of entity IDs of the proposed entities to submit.
            Each entity must have been proposed by a prior "proposeEntitiesFromFacts" tool call.
            You must have made an effort to find all the facts required to infer as many properties and outgoing links
              for each entity as possible.
          `),
          },
        },
        required: ["entityIds", "explanation"],
      },
    },
    complete: {
      name: "complete",
      description: dedent(`
            Complete the research task.
          `),
      inputSchema: {
        type: "object",
        properties: {
          explanation: explanationDefinition,
        },
        required: ["explanation"],
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
    proposeEntitiesFromFacts: {
      name: "proposeEntitiesFromFacts",
      description: dedent(`
      Propose entities from the inferred facts about the entities.

      All required facts must be obtained before proposing entities.

      Before calling this tool, you must have made a significant effort to
        find all the facts required to infer as many properties and outgoing links
        as possible for each entity.

      If you propose an entity more than once, the latest proposal will be used.
    `),
      inputSchema: {
        type: "object",
        properties: {
          explanation: explanationDefinition,
          entityIds: {
            type: "array",
            items: {
              type: "string",
              description:
                "The fact IDs of the inferred facts to propose entities from.",
            },
          },
        },
        required: ["entityIds", "explanation"],
      },
    },
  };

  const filteredTools = Object.fromEntries(
    Object.entries(allToolDefinitions).filter(
      ([toolName]) => !params.omitTools?.includes(toolName as T[number]),
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
    inferFactsFromWebPages: {
      explanation: string;
      webPages: {
        url: string;
        prompt: string;
        entityTypeIds: string[];
        linkEntityTypeIds?: string[];
      }[];
    };
    startFactGatheringSubTasks: {
      subTasks: {
        goal: string;
        explanation: string;
        relevantEntityIds: string[];
        entityTypeIds: string[];
        linkEntityTypeIds?: string[];
      }[];
    };
    proposeEntitiesFromFacts: {
      explanation: string;
      entityIds: string[];
    };
    submitProposedEntities: {
      explanation: string;
      entityIds: string[];
    };
    updatePlan: {
      explanation: string;
      plan: string;
    };
    complete: {
      explanation: string;
    };
    terminate: {
      explanation: string;
    };
  }
>;
