import dedent from "dedent";

import type { ToolDefinition } from "./types";

const coordinatorToolIds = [
  "webSearch",
  "inferEntitiesFromWebPage",
  "getWebPageSummary",
  "submitProposedEntities",
  // "discardProposedEntities",
  "complete",
  "terminate",
  "updatePlan",
] as const;

export type CoordinatorToolId = (typeof coordinatorToolIds)[number];

export const isCoordinatorToolId = (
  value: string,
): value is CoordinatorToolId =>
  coordinatorToolIds.includes(value as CoordinatorToolId);

export const coordinatorToolDefinitions: Record<
  CoordinatorToolId,
  ToolDefinition<CoordinatorToolId>
> = {
  webSearch: {
    toolId: "webSearch",
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
    toolId: "inferEntitiesFromWebPage",
    description:
      "Infer entities from the content of a web page. This tool is useful for extracting structured data from a web page. This is an expensive operation, so use it conservatively.",
    inputSchema: {
      type: "object",
      properties: {
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
      },
      required: ["url", "prompt"],
    },
  },
  getWebPageSummary: {
    toolId: "getWebPageSummary",
    description:
      "Get the summary of a web page. This may be useful to decide whether to read the full page, or choose between a set of web pages which may be relevant to complete a task.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the web page to summarize",
        },
      },
      required: ["url"],
    },
  },
  submitProposedEntities: {
    toolId: "submitProposedEntities",
    description:
      "Submit one or more proposed entities as the `result` of the research task.",
    inputSchema: {
      type: "object",
      properties: {
        entityIds: {
          type: "array",
          items: {
            type: "string",
          },
          description: "An array of entity IDs of the entities to submit.",
        },
      },
      required: ["entityIds"],
    },
  },
  complete: {
    toolId: "complete",
    description: "Complete the research task.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  terminate: {
    toolId: "terminate",
    description:
      "Terminate the research task, because it cannot be completed with the provided tools.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  updatePlan: {
    toolId: "updatePlan",
    description:
      "Update the plan for the research task. You should call this alongside other tool calls to progress towards completing the task.",
    inputSchema: {
      type: "object",
      properties: {
        plan: {
          type: "string",
          description: "The updated plan for the research task.",
        },
      },
      required: ["plan"],
    },
  },
  // discardProposedEntities: {
  //   toolId: "discardProposedEntities",
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

export type CoordinatorToolCallArguments = {
  webSearch: {
    query: string;
  };
  inferEntitiesFromWebPage: {
    url: string;
    prompt: string;
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
  complete: object;
  terminate: object;
};
