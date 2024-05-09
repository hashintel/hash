import type { CompareLlmResponseConfig } from "./types";

export const config: CompareLlmResponseConfig = {
  models: ["gpt-4-0125-preview", "claude-3-opus-20240229"],
  llmParams: {
    systemPrompt:
      'You are a coordinating agent for a research task.\n\nThe user will provide you with:\n- Prompt: the text prompt you need to satisfy to complete the research task\n- Entity Types: the types of entities you can propose to satisfy the research prompt\n\n\n\nYou must completely satisfy the research prompt, without any missing information.\n    \n    Make as many tool calls as are required to progress towards completing the task.\n\n    You have not previously submitted any proposed entities.\n\n    You have not previously submitted any proposed links.\n\n    \n\n    You have previously proposed the following plan:\n    Plan to complete the research task of finding the subsidiary companies of Google:\n\n1. **Search for Information**:\n - Use the web search tool with the query "subsidiary companies of Google" to find relevant URLs that could contain this information.\n\n2. **Analyze Search Results**:\n - Review the summaries of the web pages from the search results using the getWebPageSummary tool to determine which pages are most likely to contain comprehensive and accurate information about Google\'s subsidiaries.\n\n3. **Extract Information**:\n - From the selected web pages, use the inferEntitiesFromWebPage tool to infer the entities of type "company" that are subsidiaries of Google. This task will include specifying the relationship between Google and these companies as subsidiaries.\n\n4. **Prepare and Submit Data**:\n - Once the subsidiaries are identified and confirmed from the web page, propose and submit these company entities using the submitProposedEntities tool.\n\n5. **Final Review and Completion**:\n - Review all the obtained and submitted information to ensure everything is correct and comprehensive. After final verification, use the complete tool to finalize the task.\n\nBy following this detailed plan, we can efficiently use the available tools to find and document the subsidiaries of Google, fulfilling the research task as required.\n    If you want to deviate from this plan, update it using the "updatePlan" tool.\n    You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.',
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Prompt: Find the subsidiary companies of Google\nEntity Types: [{"$id":"https://hash.ai/@ftse/types/entity-type/company/v/1","title":"Company","description":"A company","links":{"https://hash.ai/@ftse/types/entity-type/invested-in/v/1":{"type":"array","items":{"oneOf":[{"$ref":"https://hash.ai/@ftse/types/entity-type/stock-market-constituent/v/1"}]},"ordered":false}},"properties":{"name":{"$id":"https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1","title":"Name","description":"A word or set of words by which something is known, addressed, or referred to.","oneOf":[{"title":"Text","description":"An ordered sequence of characters","type":"string"}]},"description":{"$id":"https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1","title":"Description","description":"A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.","oneOf":[{"title":"Text","description":"An ordered sequence of characters","type":"string"}]}}}]',
          },
        ],
      },
    ],
    tools: [
      {
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
      {
        name: "inferEntitiesFromWebPage",
        description:
          "Infer entities from the content of a web page. This tool is useful for extracting structured data from a web page. This is an expensive operation, so use it conservatively.",
        inputSchema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description:
                'An explanation of why this tool call is required to satisfy the task,\nand how it aligns with the current plan. If the plan needs to be modified,\nmake a call to the "updatePlan" tool.',
            },
            url: {
              type: "string",
              description: "The URL of the web page",
            },
            prompt: {
              type: "string",
              description:
                "A prompt instructing the inference agent which entities should be inferred from the webpage.\nDo not specify any information of the structure of the entities, as this is predefined by\n  the entity type.\n\nYou must be specific about which and how many entities you need from the webpage to satisfy the\nresearch task.",
            },
            entityTypeIds: {
              type: "array",
              items: {
                type: "string",
                description:
                  "The entity type IDs of the kind of entities to infer from the web page.\nYou must specify at least one.",
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
      {
        name: "getWebPageSummary",
        description:
          "Get the summary of a web page. This may be useful to decide whether to read the full page, or choose between a set of web pages which may be relevant to complete a task.",
        inputSchema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description:
                'An explanation of why this tool call is required to satisfy the task,\nand how it aligns with the current plan. If the plan needs to be modified,\nmake a call to the "updatePlan" tool.',
            },
            url: {
              type: "string",
              description: "The URL of the web page to summarize",
            },
          },
          required: ["url", "explanation"],
        },
      },
      {
        name: "submitProposedEntities",
        description:
          "Submit one or more proposed entities as the `result` of the research task.",
        inputSchema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description:
                'An explanation of why this tool call is required to satisfy the task,\nand how it aligns with the current plan. If the plan needs to be modified,\nmake a call to the "updatePlan" tool.',
            },
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
      {
        name: "complete",
        description: "Complete the research task.",
        inputSchema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description:
                'An explanation of why this tool call is required to satisfy the task,\nand how it aligns with the current plan. If the plan needs to be modified,\nmake a call to the "updatePlan" tool.',
            },
          },
          required: ["explanation"],
        },
      },
      {
        name: "terminate",
        description:
          "Terminate the research task, because it cannot be completed with the provided tools.",
        inputSchema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description:
                'An explanation of why this tool call is required to satisfy the task,\nand how it aligns with the current plan. If the plan needs to be modified,\nmake a call to the "updatePlan" tool.',
            },
          },
          required: ["explanation"],
        },
      },
      {
        name: "updatePlan",
        description:
          "Update the plan for the research task.\nYou can call this alongside other tool calls to progress towards completing the task.",
        inputSchema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description:
                "An explanation of why the plan needs to be updated, and\nhow the updated plan aligns with the task.",
            },
            plan: {
              type: "string",
              description: "The updated plan for the research task.",
            },
          },
          required: ["plan", "explanation"],
        },
      },
      {
        name: "proposeAndSubmitLink",
        description:
          "Propose and submit a link entity, which creates a link between two entities.\n\nThe source or target entity can be:\n  - a proposed entity\n  - an existing entity\n\nIf the source or target are a proposed entity that has not yet been submitted,\n  they will be submitted in this tool call.",
        inputSchema: {
          type: "object",
          properties: {
            explanation: {
              type: "string",
              description:
                'An explanation of why this tool call is required to satisfy the task,\nand how it aligns with the current plan. If the plan needs to be modified,\nmake a call to the "updatePlan" tool.',
            },
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
    ],
  },
};
