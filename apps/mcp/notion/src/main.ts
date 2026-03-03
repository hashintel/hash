#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@notionhq/client";
import { config } from "dotenv-flow";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { getPageContent, searchPageByTitle } from "./main/notion-services.js";

config({ path: "../../../.env.local", silent: true });

if (!process.env.MCP_NOTION_API_KEY) {
  throw new Error("MCP_NOTION_API_KEY is not set");
}

const notion = new Client({
  auth: process.env.MCP_NOTION_API_KEY,
});

const SearchPageRequestSchema = z.object({
  title: z
    .string()
    .meta({ description: "The title to search for in Notion pages" }),
});

const GetPageContentRequestSchema = z.object({
  pageId: z.string().meta({
    description: "The id of the page to retrieve content from",
  }),
});

const tools = [
  {
    name: "search_page_by_title",
    description: "Search for Notion pages by title",
    inputSchema: zodToJsonSchema(SearchPageRequestSchema),
  },
  {
    name: "get_page_content",
    description: "Get a Notion page's content as markdown",
    inputSchema: zodToJsonSchema(GetPageContentRequestSchema),
  },
] as const;

type ToolName = (typeof tools)[number]["name"];

const server = new Server(
  {
    name: "notion-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const typedName = request.params.name as ToolName;

  switch (typedName) {
    case "search_page_by_title": {
      const args = SearchPageRequestSchema.parse(request.params.arguments);
      const pages = await searchPageByTitle(notion, args.title);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(pages, null, 2),
          },
        ],
      };
    }

    case "get_page_content": {
      const args = GetPageContentRequestSchema.parse(request.params.arguments);
      const content = await getPageContent(notion, args.pageId);

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("Server started");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Server error:", error);
  process.exit(1);
});
