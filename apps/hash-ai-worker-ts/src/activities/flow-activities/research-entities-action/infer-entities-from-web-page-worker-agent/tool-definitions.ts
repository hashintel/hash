import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import dedent from "dedent";

import type { LlmToolDefinition } from "../../../shared/get-llm-response/types";
import type { ToolName } from "./types";

const explanationDefinition = {
  type: "string",
  description: dedent(`
    An explanation of why this tool call is required to satisfy the task,
    and how it aligns with the current plan. If the plan needs to be modified,
    make a call to the "updatePlan" tool.
  `),
} as const;

export const toolDefinitions: Record<ToolName, LlmToolDefinition<ToolName>> = {
  getWebPageInnerHtml: {
    name: "getWebPageInnerHtml",
    description: dedent(`
      Get the inner HTML of a web page.
      Do not call this tool for files hosted at a URL, only for web pages.
      You can use the "queryPdf" tool to query a PDF document at a URL instead.
    `),
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        url: {
          type: "string",
          description: "The URL of the web page.",
        },
      },
      required: ["url", "explanation"],
    },
  },
  inferEntitiesFromWebPage: {
    name: "inferEntitiesFromWebPage",
    description: "Infer entities from some a web page.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        url: {
          type: "string",
          description: "The URL of the web page.",
        },
        hmtlContent: {
          type: "string",
          description: dedent(`
            The HTML content with the relevant sections, paragraphs, tables
              or other content from the webpage that describe entities of the requested type(s).

            You must not modify the content in any way.

            You must include table headers when passing data from a table.

            Do not under any circumstance truncate or provide partial text which may lead to missed entities
              or properties.

            You must provide as much text as necessary to infer all
              the required entities and their properties from the web page in a single tool call.

            ${
              ""
              /**
               * Note: This was previously included to sometimes improve the unit formatting
               * for the inference agent, however this came with the cost that the worker
               * agent would frequently truncate text. This has been omitted so that the
               * unit inference becomes the responsibility of the inference agent.
               */
              // For example if the text contains data from a table, you must provide the table
              // column names. If the are column names specifying units, you must explicitly
              // specify the unit for each value in the table. For example if the column
              // specifies a unit in millions (m), append this to each value (e.g. "10 million (m)").

              /** Note: the agent doesn't do this even if you ask it to */
              // If there are units in the data, you must give a detailed definition for
              // each unit and what it means.
            }
            `),
        },
        /**
         * @todo: consider letting the agent set `"unknown"` or `"as many as possible"` as
         * an argument here, incase it isn't sure of the number of entities that can be inferred.
         */
        expectedNumberOfEntities: {
          type: "number",
          description: dedent(`
            The expected number of entities which should be inferred from the HTML content.
            You should expect at least 1 entity to be inferred.
          `),
        },
        validAt: {
          type: "string",
          format: "date-time",
          description: dedent(`
            A date-time string in ISO 8601 format, representing when the provided HTML content is valid at.
            If this cannot be found on the web page, assume it is the current date and time.
            The current time is "${new Date().toISOString()}".
          `),
        },
        prompt: {
          type: "string",
          description: dedent(`
            A prompt instructing the inference agent which entities should be inferred from the HTML content.
            Do not specify any information of the structure of the entities, as this is predefined by
              the entity type.
          `),
        },
        entityTypeIds: {
          type: "array",
          items: {
            type: "string",
          },
          description: dedent(`
            An array of entity type IDs which should be inferred from the provided HTML content.
          `),
        },
        linkEntityTypeIds: {
          type: "array",
          items: {
            type: "string",
          },
          description: dedent(`
            An array of link entity type IDs which should be inferred from provided HTML content.
          `),
        },
      },
      required: [
        "url",
        "hmtlContent",
        "expectedNumberOfEntities",
        "validAt",
        "prompt",
        "explanation",
        "entityTypeIds",
      ],
    },
  },
  submitProposedEntities: {
    name: "submitProposedEntities",
    description:
      "Submit one or more proposed entities as the `result` of the inference task.",
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
            An array of entity IDs of the entities to submit.
            These must correspond to the IDs provided by a "inferEntitiesFromWebPage" tool call.
          `),
        },
      },
      required: ["entityIds", "explanation"],
    },
  },
  queryPdf: {
    name: "queryPdf",
    description: dedent(`
      Query a PDF document at a URL.
      Use this tool to ask questions about the content of a PDF document, hosted at a URL.
      You will be provided with a list of relevant sections from the document based on your query.
    `),
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        fileUrl: {
          type: "string",
          description: "The absolute URL of the PDF document.",
        },
        /**
         * Note: using the argument name `query` here lead to the LLM agent
         * providing very short queries, leading to worse results. Using
         * `description` instead seems to lead to more verbose descriptions
         * of the information being sought, hence better query results.
         */
        description: {
          type: "string",
          description: dedent(`
            A detailed description of the relevant information you are seeking from the PDF document.
            Include keywords, phrases, or the name specific sections you are looking for.
          `),
        },
      },
      required: ["fileUrl", "description", "explanation"],
    },
  },
  complete: {
    name: "complete",
    description: dedent(`
      Complete the inference task.
      You must explain how the task has been completed with the existing submitted entities.
      Do not make this tool call if the research prompt hasn't been fully satisfied.
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
      "Terminate the inference task, because it cannot be completed with the provided tools.",
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
    description:
      "Update the plan for the research task. You should call this alongside other tool calls to progress towards completing the task.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: {
          type: "string",
          description: dedent(`
            An explanation of why the plan needs to be updated, and
            how it aligns with the current plan.
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

export type ToolCallArguments = Subtype<
  Record<ToolName, unknown>,
  {
    getWebPageInnerHtml: {
      url: string;
    };
    inferEntitiesFromWebPage: {
      url: string;
      hmtlContent: string;
      expectedNumberOfEntities: number;
      validAt: string;
      prompt: string;
      entityTypeIds: VersionedUrl[];
      linkEntityTypeIds?: VersionedUrl[];
    };
    submitProposedEntities: {
      entityIds: string[];
    };
    updatePlan: {
      plan: string;
    };
    complete: never;
    terminate: never;
    queryPdf: {
      fileUrl: string;
      description: string;
    };
  }
>;