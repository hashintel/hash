import type { JSONSchema } from "openai/lib/jsonschema";
import type { ChatCompletionMessageToolCall } from "openai/resources";

const coordinatorToolIds = [
  "webSearch",
  "inferEntitiesFromWebPage",
  "getWebPageSummary",
  "submitProposedEntities",
  // "discardProposedEntities",
  "complete",
  "terminate",
] as const;

export type CoordinatorToolId = (typeof coordinatorToolIds)[number];

export const isCoordinatorToolId = (
  value: string,
): value is CoordinatorToolId =>
  coordinatorToolIds.includes(value as CoordinatorToolId);

type ToolDefinition = {
  toolId: CoordinatorToolId;
  description: string;
  inputSchema: JSONSchema;
};

export const coordinatorToolDefinitions: Record<
  CoordinatorToolId,
  ToolDefinition
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
      },
      required: ["url"],
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
  };
  getWebPageSummary: {
    url: string;
  };
  submitProposedEntities: {
    entityIds: string[];
  };
  complete: object;
  terminate: object;
};

export type CoordinatorToolCall = {
  toolId: CoordinatorToolId;
  openAiToolCall: ChatCompletionMessageToolCall;
  parsedArguments: object;
};

export type CompletedCoordinatorToolCall = {
  output: string;
} & CoordinatorToolCall;
