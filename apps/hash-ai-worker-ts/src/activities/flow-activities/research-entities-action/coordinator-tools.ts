import type { Subtype } from "@local/advanced-types/subtype";
import dedent from "dedent";

import type { LlmToolDefinition } from "../../shared/get-llm-response/types";

const coordinatorToolNames = [
  "requestHumanInput",
  "webSearch",
  "inferEntitiesFromWebPage",
  "getWebPageSummary",
  "submitProposedEntities",
  // "discardProposedEntities",
  "proposeAndSubmitLink",
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

export const coordinatorToolDefinitions: Record<
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
        questions: {
          type: "array",
          items: {
            type: "string",
            description:
              "A question to help clarify or complete the research task",
          },
          description: "A list of questions to ask the user",
        },
      },
      required: ["questions"],
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
      },
      required: ["query"],
    },
  },
  inferEntitiesFromWebPage: {
    name: "inferEntitiesFromWebPage",
    description:
      "Infer entities from the content of a web page. This tool is useful for extracting structured data from a web page. This is an expensive operation, so use it conservatively.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        url: {
          type: "string",
          description: "The URL of the web page",
        },
        prompt: {
          type: "string",
          description: dedent(`
            A prompt instructing the inference agent which entities should be inferred from the webpage.
            Do not specify any information of the structure of the entities, as this is predefined by
              the entity type.

            You must be specific about which and how many entities you need from the webpage to satisfy the
            research task.
          `),
        },
        entityTypeIds: {
          type: "array",
          items: {
            type: "string",
            description: dedent(`
              The entity type IDs of the kind of entities to infer from the web page.
              You must specify at least one.
            `),
          },
        },
        linkEntityTypeIds: {
          type: "array",
          items: {
            type: "string",
            description:
              "The link entity type IDs of the kind of link entities to infer from the web page",
          },
        },
      },
      required: ["url", "prompt", "explanation", "entityTypeIds"],
    },
  },
  getWebPageSummary: {
    name: "getWebPageSummary",
    description:
      "Get the summary of a web page. This may be useful to decide whether to read the full page, or choose between a set of web pages which may be relevant to complete a task.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        url: {
          type: "string",
          description: "The URL of the web page to summarize",
        },
      },
      required: ["url", "explanation"],
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
          description: "An array of entity IDs of the entities to submit.",
        },
      },
      required: ["entityIds", "explanation"],
    },
  },
  complete: {
    name: "complete",
    description: "Complete the research task.",
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
  proposeAndSubmitLink: {
    name: "proposeAndSubmitLink",
    description: dedent(`
      Propose and submit a link entity, which creates a link between two entities.

      The source or target entity can be:
        - a proposed entity
        - an existing entity

      If the source or target are a proposed entity that has not yet been submitted,
        they will be submitted in this tool call.
    `),
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        sourceEntityId: {
          type: "string",
          description: "The ID of the source proposed or existing entity.",
        },
        targetEntityId: {
          type: "string",
          description: "The ID of the target proposed or existing entity.",
        },
        linkEntityTypeId: {
          type: "string",
          description: "The link entity type ID of the proposed link.",
        },
      },
      required: [
        "sourceEntityId",
        "targetEntityId",
        "linkEntityTypeId",
        "explanation",
      ],
    },
  },
  // discardProposedEntities: {
  //   name: "discardProposedEntities",
  //   description: "Discard previously submitted proposed entities.",
  //   inputSchema: {
  //     type: "object",
  //     properties: {
  //       entityIds: {
  //         type: "array",
  //         items: {
  //           type: "string",
  //         },
  //         description:
  //           "An array of entity IDs of the previously submitted entities which should be discarded.",
  //       },
  //     },
  //     required: ["entityIds"],
  //   },
  // },
};

export type CoordinatorToolCallArguments = Subtype<
  Record<CoordinatorToolName, unknown>,
  {
    requestHumanInput: {
      questions: string[];
    };
    webSearch: {
      query: string;
    };
    inferEntitiesFromWebPage: {
      url: string;
      prompt: string;
      entityTypeIds: string[];
      linkEntityTypeIds?: string[];
    };
    getWebPageSummary: {
      url: string;
    };
    submitProposedEntities: {
      entityIds: string[];
    };
    updatePlan: {
      plan: string;
    };
    proposeAndSubmitLink: {
      sourceEntityId: string;
      targetEntityId: string;
      linkEntityTypeId: string;
    };
    complete: never;
    terminate: never;
  }
>;
